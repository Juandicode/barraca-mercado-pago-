# Barraca Bulevar — CI/CD Pipeline con GitHub Actions, Docker y AWS Lambda

Pipeline de integración y despliegue continuo para una app de e-commerce con pagos online vía Mercado Pago. Cada `git push` a `main` dispara automáticamente el build de una imagen Docker, su publicación versionada en Amazon ECR, y el despliegue a AWS Lambda — sin intervención manual.

Este proyecto migra una app originalmente pensada para Vercel Serverless Functions hacia una arquitectura containerizada, portable y automatizada en AWS, manteniendo el costo en **$0** dentro del free tier.

---

## Arquitectura

```
┌─────────────┐     git push      ┌──────────────────┐
│  Developer  │ ────────────────► │  GitHub (main)    │
└─────────────┘                   └────────┬──────────┘
                                            │ dispara
                                            ▼
                                   ┌──────────────────┐
                                   │  GitHub Actions   │
                                   │  (workflow YAML)  │
                                   └────────┬──────────┘
                                            │
                     ┌──────────────────────┼──────────────────────┐
                     ▼                                              ▼
            ┌─────────────────┐                          ┌─────────────────────┐
            │  Build imagen    │                          │  Push a Amazon ECR  │
            │  Docker (arm64)  │ ───────────────────────► │  (tags: SHA + latest)│
            └─────────────────┘                          └──────────┬───────────┘
                                                                      │
                                                                      ▼
                                                          ┌─────────────────────┐
                                                          │  Update Lambda code  │
                                                          │  (nueva imagen)      │
                                                          └──────────┬───────────┘
                                                                      │
                                                                      ▼
                                                          ┌─────────────────────┐
                                                          │  AWS Lambda          │
                                                          │  (Express + Lambda   │
                                                          │   Web Adapter)       │
                                                          └──────────┬───────────┘
                                                                      │
                                                                      ▼
                                                          ┌─────────────────────┐
                                                          │  API Gateway (HTTP)  │
                                                          │  URL pública HTTPS   │
                                                          └──────────┬───────────┘
                                                                      │
                                                                      ▼
                                                          ┌─────────────────────┐
                                                          │  Usuario final /     │
                                                          │  Mercado Pago        │
                                                          └─────────────────────┘
```

## Stack técnico

- **Backend:** Node.js + Express (adaptado desde funciones serverless originales de Vercel)
- **Pagos:** Mercado Pago (Checkout Pro, SDK oficial `mercadopago`)
- **Containerización:** Docker (imagen `node:20-alpine`, arquitectura arm64)
- **Adaptador serverless:** [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter) — permite correr una app Express estándar dentro de Lambda sin reescribir el código
- **Registry de imágenes:** Amazon ECR
- **Cómputo:** AWS Lambda (arm64, 512 MB, timeout 30s)
- **Exposición pública:** API Gateway (HTTP API)
- **CI/CD:** GitHub Actions
- **Gestión de secretos:** GitHub Secrets (credenciales de AWS) + variables de entorno de Lambda (token de Mercado Pago)

## El pipeline (`.github/workflows/deploy.yml`)

En cada push a `main`:

1. **Checkout** del código
2. **Autenticación** contra AWS usando credenciales guardadas como GitHub Secrets (nunca expuestas en el código)
3. **Login** a Amazon ECR
4. **Build** de la imagen Docker, con **dos tags**: uno con el SHA del commit (trazabilidad — "esta imagen es exactamente este commit") y otro `latest` (conveniencia)
5. **Push** de ambos tags a ECR
6. **Actualización de la función Lambda** para que use la imagen recién publicada (`aws lambda update-function-code`)

Todo esto corre en ~15-20 segundos, sin que un humano toque Docker, ECR o Lambda manualmente.

## Decisiones de diseño y por qué

**Lambda + API Gateway, no ECS/Fargate.** Fargate no tiene free tier real (cobra por hora de cómputo desde el minuto uno). Lambda sí lo tiene, de forma permanente (1M de requests/mes gratis). Para una app de bajo tráfico como esta, Lambda es la elección correcta tanto técnica como económicamente — y de paso mantiene el proyecto en $0.

**AWS Lambda Web Adapter en vez de reescribir la app.** La app ya estaba armada como funciones serverless al estilo Vercel (`module.exports = async (req, res) => {...}`). En vez de reescribir toda la lógica para el modelo de eventos nativo de Lambda, se envolvió en un servidor Express estándar y se usó el Lambda Web Adapter — una extensión oficial de AWS que traduce eventos de Lambda a requests HTTP normales. Resultado: cero cambios en la lógica de negocio (`crear-preferencia.js` quedó intacto), máxima portabilidad (la misma imagen corre igual en Lambda, en cualquier otro proveedor cloud, o en tu laptop).

**Rol de IAM dedicado, no reutilizado.** Se creó `barraca-bulevar-lambda-role` específico para este proyecto, en vez de reutilizar el rol de otro Lambda existente. Principio de mínimo privilegio: cada función con exactamente los permisos que necesita (en este caso, solo escribir logs a CloudWatch), ni uno más.

**Dos tags por imagen (SHA + latest).** El tag `latest` es cómodo, pero no dice nada sobre qué versión del código corre en producción en un momento dado. El tag con el SHA del commit permite responder con precisión "¿qué código está corriendo ahora mismo?" y hacer rollback a una versión específica si hace falta.

## Troubleshooting real (documentado tal cual ocurrió)

### 1. `auto_return invalid: back_url.success must be defined`
Mercado Pago exige que `back_urls.success` sea una URL pública HTTPS válida cuando se usa `auto_return`. Probando en `localhost`, MP rechaza la preferencia porque no puede validar esa URL. **No es un bug de la app** — es una restricción real de la API. Se resolvió solo una vez que `SITE_URL` pasó a apuntar a la URL pública de API Gateway.

### 2. `Extension.LaunchError` en el Lambda Web Adapter
Al crear la función Lambda por primera vez sin especificar arquitectura, AWS usó el default (`x86_64`). Pero la imagen se había buildeado en una Mac con Apple Silicon, que genera imágenes `arm64` por defecto. El binario del adapter (compilado para una arquitectura específica) no podía arrancar con esa incompatibilidad. **Solución:** recrear la función Lambda con `--architectures arm64`, explícitamente alineada con la arquitectura de build.

### 3. Credencial de AWS expuesta accidentalmente en una sesión de terminal
Durante la configuración de GitHub Secrets, una Access Key de AWS quedó pegada por error en un contexto no seguro. **Respuesta:** se desactivó la key comprometida de inmediato en IAM, se generó una nueva, y se actualizó tanto en `~/.aws/credentials` local como en los GitHub Secrets del repo. Principio aplicado: una credencial que se escribió en un lugar donde no debía estar se considera comprometida y se rota — no se confía en que "nadie la vio".

### 4. `PA_UNAUTHORIZED_RESULT_FROM_POLICIES` — token con longitud incorrecta
El checkout seguía fallando incluso con `SITE_URL` pública. Los logs de CloudWatch mostraron un 403 de Mercado Pago indicando que el Access Token no estaba llegando correctamente. Comparando la longitud del valor guardado en la variable de entorno de Lambda (92 caracteres) contra la longitud real del token (76 caracteres), se confirmó que se había colado un salto de línea al pegar el valor manualmente. **Solución:** extraer el valor directamente del archivo `.env` con `grep` + `tr -d`, evitando el copy-paste manual y su margen de error.

## Costo

**$0.** Desglose:
- GitHub Actions: dentro de los 2.000 minutos/mes gratis
- ECR: dentro de los 500 MB gratis del primer año
- Lambda: dentro del free tier permanente (1M requests/mes)
- API Gateway: dentro del free tier de los primeros 12 meses

## Cómo reproducirlo

```bash
# Build local
docker build -t barraca-bulevar .

# Probar local (requiere .env con MP_ACCESS_TOKEN y SITE_URL)
docker run -p 3000:3000 --env-file .env barraca-bulevar

# Push manual a ECR (primera vez)
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-2.amazonaws.com
docker tag barraca-bulevar:latest <account-id>.dkr.ecr.us-east-2.amazonaws.com/barraca-bulevar:latest
docker push <account-id>.dkr.ecr.us-east-2.amazonaws.com/barraca-bulevar:latest
```

A partir de ahí, cualquier `git push` a `main` dispara el pipeline automático.
