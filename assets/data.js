/* ==========================================================================
   DONNÉES DE LA BOUTIQUE — le catalogue public vient de la base partagée.
   ========================================================================== */
"use strict";

/* ==========================================================================
   CONFIGURATION DE LA BOUTIQUE
   ========================================================================== */
const STORE_CONFIG = {
  name: "Rama's Parfumerie",
  whatsapp: "221781558813",
  phone: "+221 78 155 88 13",
  email: "niangramatoulaye4@gmail.com",
  address: "Thiaroye",
  instagram: "https://www.instagram.com/ramaniang81?utm_source=qr&stkn=MXZiZ2cwMnpkMDAx",
  facebook: "https://www.facebook.com/share/1DZ7AsTwfj/",
  tiktok: "https://www.tiktok.com/@ramsesse1?_r=1&_t=ZS-99XDhvMPcNk",
  deliveryFees: {
    dakar: "1 000 à 2 000 FCFA",
    retrait: "Localisation à préciser"
  }
};

window.STORE_API_BASE = location.hostname === "aaguisse.github.io"
  ? "https://ramas-parfumerie-app.onrender.com"
  : "";

/* ==========================================================================
   FAMILLES DE PRODUITS
   Chaque famille a sa propre page (onglet). "page" doit correspondre au nom
   du fichier HTML de cette famille.
   ========================================================================== */
const CATEGORIES = [
  { id:"parfums",      name:"Parfums",              description:"Des jus signature pour homme et femme.",       page:"produits-parfums.html" },
  { id:"brumes",       name:"Brumes corporelles",   description:"Une touche de fraîcheur légère au quotidien.", page:"produits-brumes.html" },
  { id:"huiles",       name:"Huiles parfumées",     description:"Des huiles nourrissantes et délicatement parfumées.", page:"produits-huiles.html" },
  { id:"soins",        name:"Soins du corps",       description:"Des textures riches pour une peau douce.",     page:"produits-soins.html" },
  { id:"capillaires",  name:"Produits capillaires", description:"Des soins pour des cheveux forts et brillants.", page:"produits-capillaires.html" },
  { id:"coffrets",     name:"Coffrets",             description:"Des sélections prêtes à offrir.",              page:"produits-coffrets.html" },
  { id:"accessoires",  name:"Accessoires",          description:"Pour prolonger et personnaliser votre routine.", page:"produits-accessoires.html" },
  { id:"thiouraye",    name:"Thiouraye (Encens)",  description:"Des encens parfumés pour une atmosphère chaleureuse.", page:"produits-thiouraye.html" }
];
const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

function hashCode(str){
  let h = 0;
  for (let i=0; i<str.length; i++){ h = ((h<<5) - h) + str.charCodeAt(i); h |= 0; }
  return h;
}

let PRODUCTS = [];
window.STORE_PRODUCTS = PRODUCTS;
window.STORE_PRODUCTS_ERROR = null;
let refreshInProgress = false;

function notifyProductsUpdated(){
  if (typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new Event("store-products-updated"));
  }
}

async function refreshStoreProducts({ initial = false } = {}) {
  if (!window.STORE_API_BASE || refreshInProgress) return false;
  refreshInProgress = true;
  try {
    const response = await fetch(window.STORE_API_BASE + "/api/products", { cache: "no-store" });
    if (!response.ok) throw new Error("Réponse API " + response.status);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.products)) throw new Error("Catalogue API invalide");
    if (payload.persistent !== true) throw new Error("Base partagée indisponible");

    const nextProducts = payload.managed === true ? payload.products : [];
    const changed = JSON.stringify(PRODUCTS) !== JSON.stringify(nextProducts);
    const previousError = window.STORE_PRODUCTS_ERROR;
    PRODUCTS = nextProducts;
    window.STORE_PRODUCTS = PRODUCTS;
    window.STORE_PRODUCTS_ERROR = payload.managed === true
      ? null
      : "Le catalogue partagé n’est pas activé. Aucun produit de démonstration n’est affiché.";
    if (changed || previousError !== window.STORE_PRODUCTS_ERROR) notifyProductsUpdated();
    return true;
  } catch (error) {
    if (initial) {
      console.error("Chargement du catalogue partagé impossible :", error);
      PRODUCTS = [];
      window.STORE_PRODUCTS = PRODUCTS;
      window.STORE_PRODUCTS_ERROR = error.message === "Base partagée indisponible"
        ? "Le catalogue partagé n’est pas activé ou n’est pas persistant. Aucun produit de démonstration n’est affiché."
        : "Le catalogue est temporairement indisponible. Rechargez cette page dans quelques instants.";
    } else {
      const previousError = window.STORE_PRODUCTS_ERROR;
      window.STORE_PRODUCTS_ERROR = "La synchronisation est temporairement indisponible. Les produits affichés peuvent ne pas être à jour.";
      if (previousError !== window.STORE_PRODUCTS_ERROR) notifyProductsUpdated();
    }
    return false;
  } finally {
    refreshInProgress = false;
  }
}

window.STORE_PRODUCTS_READY = (async function(){
  if (window.STORE_API_BASE) {
    await refreshStoreProducts({ initial:true });
    window.refreshStoreProducts = refreshStoreProducts;
    if (typeof window.setInterval === "function" && typeof document !== "undefined") {
      window.setInterval(() => {
        if (!document.hidden) return refreshStoreProducts();
      }, 5000);
      if (typeof document.addEventListener === "function") {
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) return refreshStoreProducts();
        });
      }
    }
  } else {
    try {
      const stored = localStorage.getItem("ramasProducts");
      if (stored) {
        const localProducts = JSON.parse(stored);
        if (Array.isArray(localProducts)) PRODUCTS = localProducts;
      }
    } catch (error) {
      console.error("Chargement du catalogue local impossible :", error);
    }
  }
  window.STORE_PRODUCTS = PRODUCTS;
  return PRODUCTS;
})();

function getProduct(id){ return PRODUCTS.find(p => p.id === id); }
function getProductsByCategory(categoryId){ return PRODUCTS.filter(p => p.categoryId === categoryId); }
function getCategoryMaxPrice(categoryId){
  return getProductsByCategory(categoryId).reduce((max, product) => Math.max(max, Number(product.price) || 0), 0);
}
function getNewestProducts(limit){
  return PRODUCTS.slice().sort((a, b) => Number(b.id) - Number(a.id)).slice(0, limit);
}

/* ==========================================================================
   OUTILS PARTAGÉS
   ========================================================================== */
function formatPrice(n){
  return n.toLocaleString("fr-FR").replace(/\u202f|,/g, " ") + " FCFA";
}
function escapeXml(s){
  return String(s).replace(/[<>&'"]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;","\"":"&quot;"}[c]));
}
/* Génère une image de remplacement en SVG (aucune dépendance externe). */
function placeholderImage(label, seed){
  const tones = ["#E2C2B9","#DECBBD","#C2A497","#EEDFD3"];
  const bg = tones[Math.abs(hashCode(seed || label)) % tones.length];
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">'
    + '<rect width="400" height="500" fill="' + bg + '"/>'
    + '<g opacity="0.55">'
    + '<rect x="160" y="190" width="80" height="150" rx="16" fill="#FBF7F3"/>'
    + '<rect x="178" y="150" width="44" height="46" rx="8" fill="#FBF7F3"/>'
    + '<rect x="188" y="126" width="24" height="30" rx="5" fill="#5C4437"/>'
    + '</g>'
    + '<text x="200" y="440" text-anchor="middle" font-family="Work Sans, sans-serif" font-size="15" fill="#5C4437">' + escapeXml(label) + '</text>'
    + '<text x="200" y="462" text-anchor="middle" font-family="Work Sans, sans-serif" font-size="11" fill="#6E5C4F">Image à venir</text>'
    + '</svg>';
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
function productImage(product){
  const image = typeof product.image === "string" ? product.image.trim() : "";
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(image) || /^https?:\/\//i.test(image)) return image;
  if (typeof product.imageUrl === "string" && product.imageUrl.startsWith("/api/products/")) {
    return (window.STORE_API_BASE || "") + product.imageUrl;
  }
  if (typeof product.imageUrl === "string" && /^https:\/\//i.test(product.imageUrl)) return product.imageUrl;
  return placeholderImage(product.name, product.reference);
}
function isPlaceholder(value){
  return typeof value === "string" && value.trim().startsWith("[");
}
