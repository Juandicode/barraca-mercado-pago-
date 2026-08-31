require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// Servimos el frontend estático (index.html, imágenes, etc.)
app.use(express.static(__dirname));

// Adaptamos tu función serverless existente a una ruta Express
const crearPreferencia = require('./api/crear-preferencia');
app.post('/api/crear-preferencia', crearPreferencia);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});