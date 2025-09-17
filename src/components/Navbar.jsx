import React from "react";
import { NavLink } from "react-router-dom";

const linkBase =
  "px-3 py-2 rounded-xl text-sm font-medium transition-colors";
const linkActive = "bg-[#398FFF] text-white";
const linkIdle   = "text-[#398FFF] hover:bg-[#E3F2FD]";

export default function Navbar() {
  return (
    <header className="bg-white border-b border-slate-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <div className="font-bold text-[#398FFF]">Beesion</div>
        <nav className="flex items-center gap-2">
          <NavLink
            to="/"
            className={({isActive}) => `${linkBase} ${isActive?linkActive:linkIdle}`}
          >
            Inicio
          </NavLink>

          <NavLink
            to="/documentacion"
            className={({isActive}) => `${linkBase} ${isActive?linkActive:linkIdle}`}
          >
            Documentación
          </NavLink>

          <NavLink
            to="/progreso"
            className={({isActive}) => `${linkBase} ${isActive?linkActive:linkIdle}`}
          >
            Casos en progreso
          </NavLink>

          <NavLink
            to="/n3"
            className={({isActive}) => `${linkBase} ${isActive?linkActive:linkIdle}`}
          >
            Nivel 3
          </NavLink>

          {/* Opcional: */}
          {/* <NavLink
            to="/ia"
            className={({isActive}) => `${linkBase} ${isActive?linkActive:linkIdle}`}
          >
            Ask IA
          </NavLink> */}
        </nav>
      </div>
    </header>
  );
}
