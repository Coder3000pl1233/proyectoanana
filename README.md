# Puzzle Juntos

MVP funcional para crear un puzzle desde una imagen y resolverlo colaborativamente, sin cuentas y en tiempo real. Incluye dificultades de 12, 24, 48 y 100 piezas. La interfaz está íntegramente en español y funciona con mouse, táctil y desde 360 px.

## Arquitectura

- `apps/client`: React 19 + Vite. Renderiza el tablero, movimiento optimista y actualizaciones remotas.
- `apps/server`: Express 5 + Socket.IO. Autoridad sobre bloqueos, posiciones, encajes, versiones y progreso.
- `packages/shared`: contratos TypeScript compartidos y configuración de dificultades.
- SQLite (`node:sqlite`) persiste la sala y todas las piezas. Las imágenes validadas se normalizan a WebP con `sharp`.

El cliente solicita `piece:lock`; solo después de `piece:locked` puede enviar `piece:move` (máximo 25/s). Al soltar, el servidor limita coordenadas, determina el encaje y persiste. Cada cambio lleva versión incremental. Una reconexión recibe `room:state` completo. Al desconectarse alguien, sus bloqueos se liberan tras 2,2 segundos si no volvió.

## Requisitos e instalación

- Node.js 22.5 o superior (recomendado Node 24).
- npm 10 o superior.

```bash
npm install
copy .env.example .env
npm run dev
```

Abrir `http://localhost:5173`. Vite deriva API, imágenes y WebSockets al servidor en `http://localhost:3001`.

## Variables de entorno

`PORT`, `CLIENT_ORIGIN`, `DATABASE_PATH`, `UPLOAD_DIR` y `MAX_IMAGE_MB`. Ver `.env.example`. En producción, `CLIENT_ORIGIN` debe coincidir exactamente con el origen público.

## Comandos

```bash
npm run dev       # frontend y backend
npm run build     # build de producción
npm start         # sirve API, WebSocket y frontend compilado
npm test          # pruebas unitarias
npm run test:e2e  # Playwright con dos navegadores
npm run lint
```

## Modelo de datos

Una fila `rooms` contiene id aleatorio de 144 bits, dificultad, ruta segura de imagen, dimensiones, grilla, JSON de piezas, estado final y fechas. Cada pieza contiene id, fila/columna, posición actual/correcta, tamaño, estado, dueño del bloqueo y versión.

## Seguridad

Multer restringe tipo, cantidad y tamaño; Sharp verifica el contenido y dimensiones. El nombre original nunca se usa como ruta. Los nombres se limpian y limitan; ids y números se validan; el servidor no acepta estados ni encajes del cliente. No se almacenan secretos.

## Política y limitaciones del MVP

Se recomienda eliminar salas tras 30 días sin actividad, pero el proceso no borra datos automáticamente. El estado de jugadores y tokens de reconexión vive en memoria; reiniciar el servidor conserva el puzzle pero no la identidad temporal. SQLite y un solo proceso son apropiados para el MVP, no para escalado horizontal. No hay administración, chat ni autenticación.

## Producción y próximos pasos

Compilar con `npm run build`, usar volumen persistente para `data/` y `uploads/`, proxy TLS con soporte WebSocket y proceso supervisado. Para escalar: PostgreSQL, almacenamiento S3/R2, adaptador Redis de Socket.IO, tokens firmados, telemetría, expiración programada y pruebas de carga. Después pueden sumarse cursores en vivo, selección de grillas personalizadas, rotación de piezas y accesibilidad alternativa al arrastre.

## Despliegue en Netlify

El archivo `netlify.toml` compila y publica el cliente automáticamente. En Netlify hay que definir `VITE_SERVER_URL` con la URL HTTPS pública del backend, sin una barra final.

El servidor no puede ejecutarse en Netlify Functions porque necesita conexiones WebSocket persistentes, SQLite y almacenamiento de imágenes. Debe desplegarse en un servicio Node con disco persistente y configurar allí `CLIENT_ORIGIN` con el dominio exacto asignado por Netlify.
