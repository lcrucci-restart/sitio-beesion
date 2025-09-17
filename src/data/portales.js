// src/data/portales.js
export const PORTALES = [
  { key: "CXM", desc: "Customer Experience Management" },
  { key: "SOM", desc: "Service Operations Management" },
  { key: "WFM", desc: "Workforce Management" },
  { key: "CPQ", desc: "Configure • Price • Quote" },
  { key: "SCRIPTS NIVEL 3", desc: "DataRepairs" },
  { key: "CASE", desc: "Gestión de casos e incidencias" },
];

// helpers opcionales si los necesitás en otros lados
export const slugifyPortal = (key) => key.toLowerCase().replace(/\s+/g, "-");
export const findPortalBySlug = (slug) =>
  PORTALES.find(p => slugifyPortal(p.key) === slug);
