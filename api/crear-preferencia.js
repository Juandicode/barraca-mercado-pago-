const fs = require('fs');
const path = require('path');
const { MercadoPagoConfig, Preference } = require('mercadopago');

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const { id, cantidad } = req.body || {};
  const qty = Number.isFinite(Number(cantidad)) && Number(cantidad) > 0 ? Math.floor(Number(cantidad)) : 1;

  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Falta el producto' });
    return;
  }

  let productos;
  try {
    const productosPath = path.join(process.cwd(), 'data', 'productos.json');
    productos = JSON.parse(fs.readFileSync(productosPath, 'utf8'));
  } catch (err) {
    console.error('No se pudo leer el catálogo', err);
    res.status(500).json({ error: 'Error interno' });
    return;
  }

  // El precio SIEMPRE sale del catálogo del servidor, nunca de lo que mande el navegador.
  const producto = productos.find((p) => p.id === id);
  if (!producto || !producto.precio) {
    res.status(400).json({ error: 'Producto inválido' });
    return;
  }

  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) {
    console.error('Falta configurar SITE_URL');
    res.status(500).json({ error: 'Error de configuración' });
    return;
  }

  try {
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: [
          {
            id: producto.id,
            title: producto.nombre,
            quantity: qty,
            unit_price: producto.precio,
            currency_id: 'UYU',
          },
        ],
        back_urls: {
          success: `${siteUrl}/?pago=exito`,
          failure: `${siteUrl}/?pago=error`,
          pending: `${siteUrl}/?pago=pendiente`,
        },
        auto_return: 'approved',
        statement_descriptor: 'BARRACA BULEVAR',
      },
    });

    res.status(200).json({ init_point: result.init_point });
  } catch (err) {
    console.error('Error creando preferencia de MP', err);
    res.status(500).json({ error: 'No se pudo generar el pago' });
  }
};
