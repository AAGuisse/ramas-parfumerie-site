"use strict";

const categories = [
  { id:"parfums", name:"Parfums" },
  { id:"brumes", name:"Brumes corporelles" },
  { id:"huiles", name:"Huiles parfumées" },
  { id:"soins", name:"Soins du corps" },
  { id:"capillaires", name:"Produits capillaires" },
  { id:"coffrets", name:"Coffrets" },
  { id:"accessoires", name:"Accessoires" },
  { id:"thiouraye", name:"Thiouraye (Encens)" }
];

let products = [];
let editingId = null;
let activeCategory = "";
let managedProducts = false;
let localCatalog = false;
let editingSnapshot = null;
let editingRevision = null;
let editingConflict = false;
let productsSnapshot = "";
let refreshInProgress = false;
let syncErrorShown = false;
const localDevelopment = ["localhost", "127.0.0.1"].includes(location.hostname);
const byId = id => document.getElementById(id);
const apiUrl = path => (window.STORE_API_BASE || "") + path;
const categoryName = id => (categories.find(category => category.id === id) || {}).name || id;
const escapeHtml = value => String(value || "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;", "'":"&#039;"}[character]));
const adminFormatPrice = value => Number(value || 0).toLocaleString("fr-FR").replace(/\u202f/g, " ") + " FCFA";

function setNotice(message, isError) {
  const notice = byId("adminNotice");
  notice.textContent = message || "";
  notice.classList.toggle("is-error", Boolean(isError));
}
function localProducts() {
  try {
    const stored = JSON.parse(localStorage.getItem("ramasProducts"));
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    return [];
  }
}
function importDeviceId() {
  let id = localStorage.getItem("ramasProductImportDevice");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("ramasProductImportDevice", id);
  }
  return id;
}
function errorMessageFromResponse(response, body) {
  try {
    const result = JSON.parse(body);
    if (result.message) return result.message;
  } catch (error) {}
  if (response.status === 413) return "L'import est trop volumineux. Réessaie ; il sera envoyé en petits lots.";
  return "Erreur du serveur (" + response.status + "). Réessaie dans quelques instants.";
}
function offerLocalImport() {
  const savedProducts = localProducts();
  if (!savedProducts.length) return;

  const notice = byId("adminNotice");
  const button = document.createElement("button");
  button.className = "btn btn-secondary";
  button.type = "button";
  button.textContent = "Importer " + savedProducts.length + " produit" + (savedProducts.length > 1 ? "s" : "") + " de cet appareil";
  button.addEventListener("click", async () => {
    if (!window.confirm("Copier ces produits dans le catalogue partagé pour les voir sur tous vos appareils ?")) return;
    button.disabled = true;
    try {
      const deviceId = importDeviceId();
      const entries = savedProducts.map(product => ({
        ...product,
        importKey: deviceId + "-" + product.id
      }));
      const batches = [];
      let batch = [];
      let batchSize = 2;
      for (const entry of entries) {
        const entrySize = new TextEncoder().encode(JSON.stringify(entry)).length;
        if (batch.length && (batch.length >= 20 || batchSize + entrySize > 2 * 1024 * 1024)) {
          batches.push(batch);
          batch = [];
          batchSize = 2;
        }
        batch.push(entry);
        batchSize += entrySize;
      }
      if (batch.length) batches.push(batch);

      let imported = 0;
      for (const [index, productsBatch] of batches.entries()) {
        const response = await fetch(apiUrl("/api/products/import"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(productsBatch)
        });
        const body = await response.text();
        if (!response.ok) throw new Error(errorMessageFromResponse(response, body));
        const result = JSON.parse(body);
        imported += result.count;
        button.textContent = "Import en cours : " + imported + " / " + savedProducts.length;
        if (index + 1 < batches.length) await new Promise(resolve => setTimeout(resolve, 150));
      }
      localStorage.removeItem("ramasProducts");
      setNotice("Import réussi : " + imported + " produit" + (imported > 1 ? "s" : "") + " sont maintenant partagés entre vos appareils.");
      await loadProducts();
    } catch (error) {
      button.disabled = false;
      setNotice(error.message || "Erreur inconnue pendant l'import. Réessaie ; aucun produit déjà importé ne sera dupliqué.", true);
    }
  });
  notice.append(" ", button);
}
function setFormError(message) { byId("formError").textContent = message || ""; }
function fillCategorySelects() {
  byId("productCategory").innerHTML = categories.map(category => '<option value="' + category.id + '">' + category.name + '</option>').join("");
  byId("adminFamilyTabs").innerHTML = '<button class="admin-family-tab is-active" type="button" data-category="">Toutes</button>' + categories.map(category => '<button class="admin-family-tab" type="button" data-category="' + category.id + '">' + category.name + '</button>').join("");
}
function resetForm() {
  editingId = null;
  editingSnapshot = null;
  editingRevision = null;
  editingConflict = false;
  byId("productForm").reset();
  byId("productId").value = "";
  byId("productStock").checked = true;
  byId("productPopularity").value = "50";
  byId("productImageFile").value = "";
  byId("imagePreview").innerHTML = "<span>Aucune photo sélectionnée</span>";
  byId("formTitle").textContent = "Nouveau produit";
  byId("saveProductBtn").textContent = "Ajouter le produit";
  byId("saveProductTop").textContent = "Ajouter";
  byId("saveProductBtn").disabled = false;
  byId("saveProductTop").disabled = false;
  setFormError("");
}
function productRevision(product) {
  return JSON.stringify([
    product.id, product.name, product.categoryId, product.description, product.price,
    product.oldPrice, product.stock, product.badge, product.reference, product.image,
    product.imageUrl, product.imageVersion, product.revision, product.featured, product.popularity
  ]);
}
function setEditingConflict() {
  editingConflict = true;
  byId("saveProductBtn").disabled = true;
  byId("saveProductTop").disabled = true;
  setFormError("Ce produit a été modifié par l’autre administrateur. Fermez puis rouvrez sa fiche avant de modifier.");
}
function editProduct(product) {
  editingId = product.id;
  editingRevision = Number(product.revision) || 1;
  editingSnapshot = productRevision(product);
  editingConflict = false;
  byId("saveProductBtn").disabled = false;
  byId("saveProductTop").disabled = false;
  byId("productId").value = product.id;
  byId("productName").value = product.name || "";
  byId("productCategory").value = product.categoryId;
  byId("productPrice").value = product.price || "";
  byId("productOldPrice").value = product.oldPrice || "";
  byId("productReference").value = product.reference || "";
  byId("productDescription").value = product.description || "";
  byId("productImage").value = product.image || product.imageUrl || "";
  byId("productImageFile").value = "";
  const image = product.image || product.imageUrl;
  byId("imagePreview").innerHTML = image ? '<img src="' + escapeHtml(image) + '" alt="Aperçu du produit">' : "<span>Aucune photo sélectionnée</span>";
  byId("productBadge").value = product.badge || "";
  byId("productPopularity").value = product.popularity || 50;
  byId("productStock").checked = product.stock !== false;
  byId("productFeatured").checked = product.featured === true;
  byId("formTitle").textContent = "Modifier le produit";
  byId("saveProductBtn").textContent = "Enregistrer les modifications";
  byId("saveProductTop").textContent = "Enregistrer";
  byId("productFormPanel").scrollIntoView({ behavior:"smooth", block:"start" });
}
function visibleProducts() {
  const term = byId("adminSearch").value.trim().toLowerCase();
  const category = activeCategory;
  return products.filter(product => {
    if (category && product.categoryId !== category) return false;
    return !term || (product.name + " " + product.reference + " " + product.description).toLowerCase().includes(term);
  });
}
function renderProducts() {
  const list = byId("adminProductList");
  const filtered = visibleProducts();
  byId("catalogueTitle").textContent = filtered.length + " produit" + (filtered.length > 1 ? "s" : "") + " réel" + (filtered.length > 1 ? "s" : "");
  if (!filtered.length) {
    list.innerHTML = '<div class="admin-empty">Aucun produit réel pour ce filtre. Ajoutez votre premier produit avec le formulaire.</div>';
    return;
  }
  list.innerHTML = filtered.map(product => {
    const image = product.image || product.imageUrl || "assets/logo-ramas-parfumerie.png";
    const badge = product.badge ? '<span class="admin-badge ' + (product.badge === "promotion" ? "promo" : "") + '">' + (product.badge === "promotion" ? "Promotion" : "Nouveau") + '</span>' : '';
    return '<article class="admin-product-row">'
      + '<img class="admin-product-thumb" src="' + escapeHtml(image) + '" alt="" loading="lazy">'
      + '<div class="admin-product-main"><strong>' + escapeHtml(product.name) + badge + '</strong><span>' + escapeHtml(categoryName(product.categoryId)) + ' · ' + escapeHtml(product.reference || "Sans référence") + '</span></div>'
      + '<div class="admin-product-price">' + adminFormatPrice(product.price) + (product.oldPrice ? '<span class="admin-product-meta">Ancien prix : ' + adminFormatPrice(product.oldPrice) + '</span>' : '') + '</div>'
      + '<div class="admin-product-status ' + (product.stock ? '' : 'is-out') + '">' + (product.stock ? "En stock" : "Rupture de stock") + '</div>'
      + '<div class="admin-product-actions"><button class="btn btn-secondary" type="button" data-edit="' + product.id + '">Modifier</button><button class="btn btn-ghost" type="button" data-stock="' + product.id + '">' + (product.stock ? 'Marquer rupture' : 'Remettre en stock') + '</button><button class="btn btn-ghost" type="button" data-delete="' + product.id + '">Supprimer</button></div>'
      + '</article>';
  }).join("");
}
function saveLocalCatalog() {
  localStorage.setItem("ramasProducts", JSON.stringify(products));
  managedProducts = true;
  localCatalog = true;
}
async function loadProducts({ background = false } = {}) {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    const response = await fetch(apiUrl("/api/products" + (localDevelopment ? "?includeImages=true" : "")), { cache:"no-store" });
    if (!response.ok) throw new Error("API indisponible");
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.products)) throw new Error("Réponse du catalogue invalide");
    managedProducts = payload.managed;
    localCatalog = localDevelopment && !payload.persistent;
    if (!payload.persistent && !localDevelopment) {
      if (background) {
        if (!syncErrorShown) setNotice("La base partagée est indisponible. Les dernières données chargées restent affichées.", true);
        syncErrorShown = true;
        return;
      }
      products = [];
      productsSnapshot = "";
      renderProducts();
      setNotice("La base partagée n'est pas connectée. Les modifications sont désactivées pour éviter de perdre vos produits.", true);
      return;
    }

    const nextProducts = payload.managed ? payload.products : [];
    const nextSnapshot = JSON.stringify(nextProducts.map(productRevision));
    const changed = nextSnapshot !== productsSnapshot;
    products = nextProducts;
    productsSnapshot = nextSnapshot;
    if (changed) renderProducts();

    if (changed && editingId !== null) {
      const currentProduct = products.find(product => Number(product.id) === Number(editingId));
      if (!currentProduct || productRevision(currentProduct) !== editingSnapshot) setEditingConflict();
    }

    if (background) {
      if (syncErrorShown) setNotice(changed
        ? "Connexion rétablie ; le catalogue a été actualisé."
        : "Connexion rétablie ; le catalogue est synchronisé.");
      else if (changed) setNotice("Catalogue actualisé avec les changements de l’autre administrateur.");
      syncErrorShown = false;
      return;
    }

    if (!payload.persistent && !localDevelopment) {
      setNotice("La base partagée n'est pas connectée. Les modifications sont désactivées pour éviter de perdre vos produits.", true);
    } else if (payload.persistent) {
      if (!payload.managed && !products.length) setNotice("La base partagée est prête.");
      offerLocalImport();
    }
  } catch (error) {
    if (background) {
      if (!syncErrorShown) setNotice("Impossible d’actualiser le catalogue partagé. Vérifiez la connexion ; les dernières données chargées restent affichées.", true);
      syncErrorShown = true;
      return;
    }
    managedProducts = false;
    localCatalog = localDevelopment;
    productsSnapshot = "";
    try {
      products = localDevelopment
        ? JSON.parse(localStorage.getItem("ramasProducts")) || window.STORE_PRODUCTS || []
        : [];
    } catch (storageError) {
      products = localDevelopment ? window.STORE_PRODUCTS || [] : [];
    }
    renderProducts();
    setNotice(localDevelopment
      ? "Mode consultation : le serveur catalogue n'est pas connecté."
      : "Le serveur catalogue est indisponible. Aucune modification ne sera enregistrée.", true);
  } finally {
    refreshInProgress = false;
  }
}
async function ensureManagedProducts() {
  if (managedProducts) return;
  if (!localDevelopment) {
    throw new Error("La base de données partagée n'est pas prête. Vos modifications ne sont pas enregistrées.");
  }
  try {
    const response = await fetch(apiUrl("/api/products"), { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(products) });
    if (!response.ok) throw new Error("API indisponible");
    managedProducts = true;
  } catch (error) {
    saveLocalCatalog();
  }
}
function readSelectedImage() {
  const file = byId("productImageFile").files[0];
  if (!file) return Promise.resolve(byId("productImage").value.trim());
  return optimizeImage(file);
}
async function optimizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const source = new Image();
      source.onload = () => {
        if (!source.naturalWidth || !source.naturalHeight) {
          reject(new Error("Cette photo ne contient pas de dimensions utilisables."));
          return;
        }
        const scale = Math.min(1, 1200 / Math.max(source.naturalWidth, source.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(source.naturalWidth * scale);
        canvas.height = Math.round(source.naturalHeight * scale);
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Impossible d’optimiser cette photo."));
          return;
        }
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          if (!blob) {
            reject(new Error("Impossible d’optimiser cette photo."));
            return;
          }
          const optimized = new FileReader();
          optimized.onload = () => resolve(optimized.result);
          optimized.onerror = () => reject(new Error("Impossible de lire la photo optimisée."));
          optimized.readAsDataURL(blob);
        }, "image/jpeg", 0.8);
      };
      source.onerror = () => reject(new Error("Impossible d’ouvrir cette photo."));
      source.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Impossible de lire la photo sélectionnée."));
    reader.readAsDataURL(file);
  });
}
async function formProduct() {
  const image = await readSelectedImage();
  return {
    name: byId("productName").value.trim(), categoryId: byId("productCategory").value,
    price: Number(byId("productPrice").value), oldPrice: byId("productOldPrice").value,
    reference: byId("productReference").value.trim(), description: byId("productDescription").value.trim(),
    image, badge: byId("productBadge").value || null,
    popularity: Number(byId("productPopularity").value) || 50,
    stock: byId("productStock").checked,
    featured: byId("productFeatured").checked,
    revision: editingId === null ? undefined : editingRevision
  };
}
byId("productForm").addEventListener("submit", async event => {
  event.preventDefault(); setFormError("");
  if (editingConflict) {
    setFormError("Ce produit a été modifié par l’autre administrateur. Fermez puis rouvrez sa fiche avant de modifier.");
    return;
  }
  try {
    const payload = await formProduct();
    if (!payload.name || !payload.categoryId || !payload.price || payload.price <= 0) { setFormError("Le nom, la famille et un prix valide sont obligatoires."); return; }
    const url = apiUrl(editingId ? "/api/products/" + editingId : "/api/products");
    await ensureManagedProducts();
    if (localCatalog) {
      const nextId = products.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
      products = editingId
        ? products.map(product => Number(product.id) === Number(editingId) ? {
          ...product,
          ...payload,
          revision: (Number(product.revision) || 1) + 1,
          id: editingId
        } : product)
        : [...products, { ...payload, revision:1, id: nextId }];
      saveLocalCatalog();
      setNotice(editingId ? "Produit modifié sur cet appareil." : "Produit ajouté sur cet appareil.");
      resetForm(); renderProducts(); return;
    }
    const response = await fetch(url, { method: editingId ? "PUT" : "POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
    const result = await response.json();
    if (response.status === 409) {
      setEditingConflict();
      await loadProducts();
      return;
    }
    if (!response.ok) throw new Error(result.message || "Enregistrement impossible.");
    setNotice(editingId ? "Produit modifié." : "Produit ajouté.");
    resetForm(); await loadProducts();
  } catch (error) { setFormError(error.message); }
});
byId("adminProductList").addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");
  const stockButton = event.target.closest("[data-stock]");
  if (editButton) { const product = products.find(item => Number(item.id) === Number(editButton.dataset.edit)); if (product) editProduct(product); }
  if (stockButton) {
    const product = products.find(item => Number(item.id) === Number(stockButton.dataset.stock));
    if (!product) return;
    try {
      await ensureManagedProducts();
      if (localCatalog) {
        products = products.map(item => Number(item.id) === Number(product.id)
          ? { ...item, stock:!item.stock, revision:(Number(item.revision) || 1) + 1 }
          : item);
        saveLocalCatalog(); renderProducts(); return;
      }
      const response = await fetch(apiUrl("/api/products/" + product.id), {
        method:"PUT",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ ...product, stock:!product.stock, revision:product.revision })
      });
      const result = await response.json();
      if (response.status === 409) setNotice(result.message || "Le produit a changé. Le catalogue va être actualisé.", true);
      else if (!response.ok) setNotice(result.message || "La disponibilité n’a pas pu être modifiée.", true);
      else setNotice(product.stock ? "Produit marqué en rupture de stock." : "Produit remis en stock.");
      await loadProducts();
    } catch (error) {
      setNotice(error.message || "La disponibilité n’a pas pu être modifiée.", true);
    }
    return;
  }
  if (deleteButton) {
    const product = products.find(item => Number(item.id) === Number(deleteButton.dataset.delete));
    if (!product || !window.confirm("Supprimer « " + product.name + " » ?")) return;
    try {
      await ensureManagedProducts();
      if (localCatalog) {
        products = products.filter(item => Number(item.id) !== Number(product.id));
        saveLocalCatalog(); if (editingId === product.id) resetForm(); renderProducts(); return;
      }
      const response = await fetch(apiUrl("/api/products/" + product.id + "?revision=" + encodeURIComponent(product.revision || 1)), { method:"DELETE" });
      const result = await response.json();
      if (response.status === 409) setNotice(result.message || "Le produit a changé. Le catalogue va être actualisé.", true);
      else if (!response.ok) setNotice(result.message || "Le produit n’a pas pu être supprimé.", true);
      else {
        setNotice("Produit supprimé.");
        if (editingId === product.id) resetForm();
      }
      await loadProducts();
    } catch (error) {
      setNotice(error.message || "Le produit n’a pas pu être supprimé.", true);
    }
  }
});
byId("newProductBtn").addEventListener("click", () => { resetForm(); byId("productFormPanel").scrollIntoView({ behavior:"smooth" }); });
byId("resetFormBtn").addEventListener("click", resetForm);
byId("adminSearch").addEventListener("input", renderProducts);
byId("productImageFile").addEventListener("change", () => {
  const file = byId("productImageFile").files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { byId("imagePreview").innerHTML = '<img src="' + reader.result + '" alt="Aperçu du produit">'; };
  reader.readAsDataURL(file);
});
byId("adminFamilyTabs").addEventListener("click", event => {
  const tab = event.target.closest("[data-category]");
  if (!tab) return;
  activeCategory = tab.dataset.category;
  byId("adminFamilyTabs").querySelectorAll(".admin-family-tab").forEach(button => button.classList.toggle("is-active", button === tab));
  renderProducts();
});
fillCategorySelects(); resetForm(); loadProducts();
window.setInterval(() => {
  if (!document.hidden) loadProducts({ background:true });
}, 5000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadProducts({ background:true });
});
