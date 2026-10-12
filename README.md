# Rigor Mortis

Juego de terror psicológico para PC con escenario 3D cenital oblicuo, renderizado con Three.js. La simulación conserva controles de teclado y ratón, exploración por niveles, anomalías, espectros y cámara UV.

## Requisitos

- Node.js 20.19 o posterior
- npm
- Navegador con WebGL 2

## Desarrollo

```sh
npm install
npm run dev
```

## Compilación

```sh
npm run build
npm run preview
```

## Tests

```sh
npm test                    # ejecuta el test de equivalencia
npm run test:equivalence    # idem
```

El test de equivalencia simula 3 000 frames en los 3 niveles, compara estado, HUD, audio y cobertura de IA contra el commit original (`b78043b`).

## Lint

```sh
npm run lint
```

## Arquitectura

```
index.html          Documento principal, HUD, modales y pantallas
css/
  styles.css        Entrada: @import tailwindcss + @import de las secciones (orden de cascada)
  variables.css     1. Tokens (:root)
  base.css          2. Reset, body, .hidden
  layout.css        3. #game-canvas
  components/
    menu.css              4.1 Menú principal
    character-select.css  4.2 Selección de personaje
    hud.css               4.3 HUD
    modals.css            4.4 Modales (caja fuerte, pausa, game over, victoria)
  states.css        5. Estados (threat, sanity, battery, hit)
  animations.css    6. Animaciones y @keyframes
  responsive.css    7. Media queries y prefers-reduced-motion
js/
  game.js           Lógica completa: config, audio, estado, IA, HUD, bucle
  renderer3d.js     Renderizado 3D con Three.js (no contiene lógica de juego)
tests/
  equivalence-test.mjs   Test de equivalencia frame-a-frame
docs/
  AUDITORIA.md      Auditoría de seguridad, clean code y SOLID
```

## Controles

- `WASD`: moverse
- Ratón: apuntar la linterna
- Mantener `Espacio`: cámara UV
- `E`: interactuar
- `P` o `Escape`: pausar o reanudar
- Caja fuerte: fila numérica o teclado numérico, `Enter` confirma y `Backspace` borra

## Almacenamiento local

El juego guarda la puntuación máxima en `localStorage` (`rigor_mortis_high_score`).
