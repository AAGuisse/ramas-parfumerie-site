const express = require('express');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

dotenv.config();

const productStore = require('./product-store');
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'true') === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const TO_EMAIL = process.env.TO_EMAIL || 'niangramatoulaye4@gmail.com';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requireAdmin(req, res, next) {
  if (!ADMIN_USER || !ADMIN_PASSWORD) {
    return res.status(503).send('L’accès administrateur n’est pas configuré.');
  }

  const authorization = req.get('Authorization') || '';
  const match = authorization.match(/^Basic ([A-Za-z0-9+/]+=*)$/);
  if (match) {
    const credentials = Buffer.from(match[1], 'base64').toString('utf8');
    const separator = credentials.indexOf(':');
    if (separator >= 0) {
      const username = credentials.slice(0, separator);
      const password = credentials.slice(separator + 1);
      const acceptedUsernames = [ADMIN_USER, ADMIN_EMAIL].filter(Boolean);
      const usernameMatches = acceptedUsernames.some(acceptedUsername => {
        const candidate = acceptedUsername.includes('@') ? username.toLowerCase() : username;
        const expected = acceptedUsername.includes('@') ? acceptedUsername.toLowerCase() : acceptedUsername;
        return safeEqual(candidate, expected);
      });
      if (usernameMatches && safeEqual(password, ADMIN_PASSWORD)) return next();
    }
  }

  res.set('WWW-Authenticate', 'Basic realm="Ramas Parfumerie Admin", charset="UTF-8"');
  return res.status(401).send('Authentification administrateur requise.');
}

function requirePersistentStore(_req, res, next) {
  if (process.env.NODE_ENV === 'production' && !productStore.isPersistent()) {
    return res.status(503).json({
      ok: false,
      message: 'Le stockage partagé des produits n’est pas configuré. Les produits ne peuvent pas être enregistrés.'
    });
  }
  next();
}

function normalizeProduct(input, id) {
  const price = Number(input.price);
  const oldPrice = input.oldPrice === '' || input.oldPrice == null ? null : Number(input.oldPrice);
  const image = typeof input.image === 'string' ? input.image.trim() : undefined;
  return {
    id: id == null ? null : id,
    name: String(input.name || '').trim(),
    categoryId: String(input.categoryId || '').trim(),
    description: String(input.description || '').trim(),
    price: Number.isFinite(price) ? price : 0,
    oldPrice: Number.isFinite(oldPrice) ? oldPrice : null,
    stock: input.stock !== false,
    badge: ['nouveau', 'promotion'].includes(input.badge) ? input.badge : null,
    reference: String(input.reference || '').trim(),
    image: image && /^\/api\/products\/\d+\/image(?:\?v=\d+)?$/.test(image) ? undefined : image,
    featured: input.featured === true,
    popularity: Number(input.popularity) || 50
  };
}

app.get('/api/products', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await productStore.list(_req.query.includeImages === 'true'));
});

app.get('/api/products/:id/image', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(404).end();
  const image = await productStore.getImage(id);
  if (!image) return res.status(404).end();
  const match = image.match(/^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) return res.status(404).end();
  res.set('Cache-Control', 'public, no-cache, must-revalidate');
  res.type(match[1]).send(Buffer.from(match[2], 'base64'));
});

app.put('/api/products', requireAdmin, requirePersistentStore, async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ ok: false, message: 'Le catalogue doit être un tableau de produits.' });
  }
  await productStore.replace(req.body);
  res.json({ ok: true, count: req.body.length });
});

app.post('/api/products/import', requireAdmin, requirePersistentStore, async (req, res) => {
  if (!Array.isArray(req.body) || req.body.length === 0 || req.body.length > 50) {
    return res.status(400).json({ ok: false, message: 'Le lot d’import doit contenir entre 1 et 50 produits.' });
  }

  const imported = req.body.map((item, index) => {
    const product = normalizeProduct(item, null);
    const importKey = String(item.importKey || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d+$/i.test(importKey) || !product.name || !product.categoryId || product.price <= 0) {
      return { error: index + 1 };
    }
    return { product, importKey };
  });
  const invalid = imported.find(item => item.error);
  if (invalid) {
    return res.status(400).json({
      ok: false,
      message: 'Le produit numéro ' + invalid.error + ' est incomplet ou invalide.'
    });
  }

  const count = await productStore.importProducts(imported);
  res.json({ ok: true, count });
});

app.post('/api/products', requireAdmin, requirePersistentStore, async (req, res) => {
  const product = normalizeProduct(req.body || {}, null);
  if (!product.name || !product.categoryId || product.price <= 0) {
    return res.status(400).json({ ok: false, message: 'Nom, famille et prix sont obligatoires.' });
  }
  const created = await productStore.create(product);
  res.status(201).json({ ok: true, product: created });
});

app.put('/api/products/:id', requireAdmin, requirePersistentStore, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(404).json({ ok: false, message: 'Produit introuvable.' });
  const product = normalizeProduct(req.body || {}, id);
  if (!product.name || !product.categoryId || product.price <= 0) {
    return res.status(400).json({ ok: false, message: 'Nom, famille et prix sont obligatoires.' });
  }
  const updated = await productStore.update(id, product);
  if (!updated) return res.status(404).json({ ok: false, message: 'Produit introuvable.' });
  res.json({ ok: true, product: updated });
});

app.delete('/api/products/:id', requireAdmin, requirePersistentStore, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(404).json({ ok: false, message: 'Produit introuvable.' });
  const removed = await productStore.remove(id);
  if (!removed) return res.status(404).json({ ok: false, message: 'Produit introuvable.' });
  res.json({ ok: true });
});

const staticRoot = fs.existsSync(path.join(__dirname, 'index.html'))
  ? __dirname
  : path.join(__dirname, '..');
app.get('/admin.html', requireAdmin, (_req, res) => {
  res.sendFile(path.join(staticRoot, 'admin.html'));
});
app.use(express.static(staticRoot));

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

app.post('/api/newsletter', async (req, res) => {
  const email = (req.body && (req.body.email || req.body.Email)) || '';

  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, message: 'Adresse e-mail invalide.' });
  }

  if (!SMTP_USER || !SMTP_PASS) {
    return res.status(500).json({
      ok: false,
      message: 'SMTP non configuré. Ajoute SMTP_USER et SMTP_PASS dans le fichier .env.'
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: SMTP_FROM,
      to: TO_EMAIL,
      replyTo: email,
      subject: 'Nouvelle inscription newsletter - Rama\'s Parfumerie',
      text: [
        'Nouvelle inscription newsletter.',
        '',
        'Email : ' + email,
        '',
        'Merci.',
      ].join('\n'),
      html: `
        <h3>Nouvelle inscription newsletter</h3>
        <p><strong>Email :</strong> ${email}</p>
        <p>Merci.</p>
      `,
    });

    return res.status(200).json({ ok: true, message: 'Inscription enregistrée.' });
  } catch (error) {
    console.error('Newsletter send failed:', error);
    return res.status(500).json({
      ok: false,
      message: 'Échec de l\'envoi. Vérifie les identifiants SMTP et le mot de passe d\'application Gmail.'
    });
  }
});

app.get('/api/health', async (_req, res) => {
  if (process.env.NODE_ENV === 'production' && !productStore.isPersistent()) {
    return res.status(503).json({ ok: false, status: 'database-not-configured' });
  }
  try {
    const persistentProducts = await productStore.checkDatabase();
    return res.json({ ok: true, status: 'server-running', persistentProducts });
  } catch (error) {
    console.error('Health check failed:', error);
    return res.status(503).json({ ok: false, status: 'database-unavailable' });
  }
});

if (require.main === module) {
  productStore.initialize()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Serveur démarré sur http://localhost:${PORT}`);
      });
    })
    .catch(error => {
      console.error('Product database initialization failed:', error);
      process.exitCode = 1;
    });
}

app.use((error, _req, res, next) => {
  console.error('Request failed:', error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ ok: false, message: 'Une erreur interne est survenue.' });
});

module.exports = app;
