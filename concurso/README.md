# Concurso de videos

Página de votación con Vercel (hosting + API) y Upstash Redis (base de datos).

## Configurar los videos
Edita **`public/videos.json`**: `id` (único, no lo cambies tras recibir votos), `title`, `author` y `embed`
(código iframe de YouTube; usa comillas simples dentro del código). `embed` vacío = espacio reservado.
Puedes tener los videos que quieras.

## Despliegue
1. Sube la carpeta a un repositorio de GitHub.
2. En vercel.com: Add New → Project → importa el repositorio → Deploy (sin cambiar nada).
3. En el proyecto: Storage → Create / Marketplace → **Upstash Redis** → conéctalo al proyecto.
   Se crean solas las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
4. Deployments → ⋯ → Redeploy.

## Cómo evita votos duplicados
Cada navegador recibe una cookie aleatoria HttpOnly. Los votos se guardan en un SET de Redis por video
(`votes:<id>`), por lo que un mismo votante no puede sumar dos veces. Además hay límite de peticiones por IP
y verificación de origen. Limitación: quien borre cookies o use otro navegador puede votar de nuevo.

## Reiniciar votos
En la consola de Upstash (Data Browser) borra las claves `votes:*`.
