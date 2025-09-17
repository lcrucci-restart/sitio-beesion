# InvGate Docs Site (Vite + React + Tailwind)

Paleta: Rojo `#fd006e`, Celeste `#398FFF`, Blanco `#FFFFFF`.

## Requisitos
- Node.js 18+
- npm

## Instalar y correr en local (VS Code)
```bash
npm install
npm run dev
```
Abrí la URL que imprime Vite (por defecto: http://localhost:5173).

## Configurar Google Sheets
En `src/App.jsx` reemplazá `GSHEET_N3_*` y `GSHEET_CL_*` con las URLs reales:
- Para **preview**: Archivo → Publicar en la web → *Incorporar* → copiá la URL (pubhtml).
- Para **Abrir en Google Sheets**: usá la URL normal de edición.

## Build de producción
```bash
npm run build
npm run preview
```
