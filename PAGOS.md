# Cómo activar los pagos con Mercado Pago

## 1. Conseguir las credenciales
1. Entrá a https://www.mercadopago.com.uy/developers/panel con tu cuenta de Mercado Pago (o creá una para el negocio).
2. Creá una aplicación ("Tus integraciones" → "Crear aplicación").
3. Copiá el **Access Token de producción** (no el de prueba/test, salvo que quieras probar primero).

## 2. Subir el sitio a Vercel (gratis)
Este sitio ahora tiene una función backend (`api/crear-preferencia.js`) además del HTML estático, por eso hace falta un hosting que la ejecute. Vercel es gratis para esto y es el más simple:

1. Instalá la CLI: `npm i -g vercel`
2. Desde esta carpeta corré: `vercel`
3. Seguí los pasos (te pide loguearte y confirmar el proyecto).

## 3. Configurar las variables de entorno
En el dashboard de Vercel (Project → Settings → Environment Variables) agregá:

- `MP_ACCESS_TOKEN` → el access token de producción del paso 1
- `SITE_URL` → la URL final de tu sitio (ej: `https://barraca-bulevar.vercel.app` o tu dominio propio)

Después de agregarlas, volvé a desplegar (`vercel --prod`) para que tomen efecto.

## 4. Probar
1. Abrí el sitio, elegí un producto con precio y tocá **Pagar**.
2. Te lleva al checkout de Mercado Pago (ahí es donde el cliente elige tarjeta: Visa, Mastercard, OCA, Cabal, Creditel, débito, etc. — eso lo maneja Mercado Pago, no tu sitio).
3. Al terminar, vuelve a tu sitio con un aviso de pago aprobado / rechazado / pendiente.

## Por qué es seguro así
- **Tu web nunca ve ni guarda números de tarjeta.** El checkout es una página de Mercado Pago; tu sitio solo pide que se cree el pago y redirige.
- **El precio lo valida el servidor**, no el navegador: `api/crear-preferencia.js` busca el precio en `data/productos.json` (el mismo archivo que usa el catálogo) e ignora cualquier precio que llegue desde el navegador. Así nadie puede pagar un producto de $3490 pagando $1.
- **El access token nunca está en el HTML** — vive solo como variable de entorno en Vercel, del lado del servidor.

## Para agregar o cambiar productos
Editá `data/productos.json` (nombre, categoría, imagen, precio, y un `id` único). Es el único lugar donde se define el catálogo — el sitio y el sistema de pagos lo leen de ahí.
