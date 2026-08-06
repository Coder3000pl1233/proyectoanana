# Plan de implementación

## Arquitectura

Monorepo npm con `apps/client` (React + Vite), `apps/server` (Express + Socket.IO + SQLite) y `packages/shared` (contratos y lógica pura). El servidor es la única autoridad: concede bloqueos, limita movimientos, calcula encajes y versiones, persiste cada liberación/encaje y emite snapshots.

## Etapas

1. Contratos tipados, generación determinista de piezas y reglas del dominio.
2. API de creación/consulta, validación de imágenes y repositorio SQLite.
3. Protocolo Socket.IO con bloqueo exclusivo, secuencias, reconexión y liberación por desconexión.
4. UI responsive, táctil y accesible para crear, entrar, jugar y completar.
5. Pruebas unitarias, integración multicliente y E2E; lint y build.

## Decisiones

- SQLite usa `node:sqlite`, incorporado en Node 22.5+, para evitar bindings nativos.
- Las imágenes se guardan con nombres aleatorios fuera del nombre original; `sharp` valida formato, tamaño y dimensiones.
- Tablero lógico fijo de 1000×700. El cliente escala coordenadas, manteniendo sincronización independiente del dispositivo.
- Las piezas usan máscaras CSS con salientes/entrantes alternados; el recorte exacto de imagen sigue una grilla para conservar rendimiento móvil.
- Los movimientos se limitan a 25/s por socket y se emiten a los demás; el cliente local se mueve inmediatamente.
- Una sala se considera vencible tras 30 días de inactividad, pero el MVP no ejecuta borrado automático.
