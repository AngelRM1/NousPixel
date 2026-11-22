# NousPixel

*por NousLogic — «La razón ordena el cosmos».*

**NousPixel** es un editor de imágenes **100 % en el navegador**: convierte el
formato, cambia la resolución y comprime una o varias imágenes, y descarga el
resultado (archivo directo si es una sola imagen, ZIP si son varias).

> 🔒 **Privacidad:** las imágenes nunca salen del dispositivo del usuario. No
> hay servidor de procesado: todo se hace con la Canvas API del navegador y
> JSZip para el ZIP.

## Qué hace

1. **Subir imágenes:** botón de selección múltiple o arrastrar y soltar
   (drag & drop). Acepta cualquier formato de imagen que el navegador pueda
   leer (PNG, JPG, WebP, AVIF, GIF, BMP…). Cada imagen muestra miniatura,
   nombre, dimensiones originales y peso.
2. **Configuración** (aparece al cargar las imágenes):
   - **Formato de salida:** AVIF, WebP, JPG/JPEG, PNG, GIF.
   - **Resolución:** original, 1920 / 1280 / 800 / 512 px de ancho, 25 % /
     50 % / 75 % del tamaño, o ancho/alto personalizado manteniendo la
     proporción.
   - **Compresión:** Básica (calidad 0.92), Media (0.75) o Alta (0.5).
   - **Aviso visible:** «La compresión con pérdida reduce la calidad de forma
     irreversible».
3. **Opciones extra** (secciones colapsables, todas neutras o desactivadas por
   defecto — si no se tocan, el resultado es el mismo que antes):
   - **Ajustes de color:** brillo 100 %, contraste 100 %, saturación 100 %,
     escala de grises off, sepia off.
   - **Rotación y volteo:** 0° por defecto (0/90/180/270), voltear
     horizontal/vertical off.
   - **Filtros:** Ninguno por defecto (Vintage, Frío, Cálido, Blanco y negro).
   - **Recorte por proporción:** Original por defecto (sin recortar); 1:1,
     4:5, 16:9, 3:2, recorte centrado.
   - **Marca de agua de texto:** desactivada por defecto; al activarla:
     texto, opacidad, tamaño y posición (4 esquinas o centro).
   - **Fondo para JPG:** blanco (`#ffffff`) por defecto; JPG no admite
     transparencia y el fondo se rellena con ese color.
   - **Quitar fondo:** desactivado por defecto y **no implementado** en esta
     versión (ver «Quitar fondo (pendiente)» más abajo).
   - **Comparador antes/después:** en cada imagen procesada, botón
     «Comparar antes / después» con deslizador.
4. **Renombrado por lote** (desactivado por defecto; si está off se conserva
   el nombre original):
   - Nombre base (ej. `foto-producto`), separador `-` o `_`.
   - Consecutivo: numérico, alfabético (A, B, …, Z, AA, AB…) o romanos
     (I, II, III…).
   - Inicio configurable: numérico ej. `222`, letra ej. `C`, romano ej. `V`.
   - Relleno con ceros para numérico: sin relleno, 2, 3 o 4 dígitos
     (ej. `0222` con 4 dígitos).
   - Vista previa en vivo de los primeros 3 nombres resultantes, con la
     extensión del formato de salida. Ejemplos:
     - Base `foto-producto`, `-`, numérico, inicio `222`, 4 dígitos, WebP →
       `foto-producto-0222.webp`, `foto-producto-0223.webp`, `foto-producto-0224.webp`
     - Base `foto`, `_`, alfabético, inicio `C`, JPG →
       `foto_C.jpg`, `foto_D.jpg`, `foto_E.jpg`
     - Base `foto`, `-`, romanos, inicio `V`, PNG →
       `foto-V.png`, `foto-VI.png`, `foto-VII.png`
   - Inicio inválido (letra fuera de A–Z, romano inválido, número negativo):
     se muestra el error en el panel y se procesa con los nombres
     originales, sin bloquear el resto del lote.
   - No hay duplicados: el consecutivo garantiza un nombre distinto por
     imagen dentro del lote.
5. **Iniciar:** procesa cada imagen con la configuración activa, con progreso
   por imagen y total, cronómetro, tamaño antes/después con el % ahorrado y
   resumen final (procesadas / con error / omitidas).
6. **Descarga:** 1 imagen → el archivo procesado; varias → un ZIP
   (`imagenes-procesadas.zip`) con todas las procesadas.
7. **Errores por imagen:** si una imagen no se puede leer o su formato de
   salida no está soportado, muestra el error en esa imagen sin romper el
   resto del lote (ver «Errores y límites»).

## Errores y límites

### Límites del lote (unificados con el prototipo web)

Los límites viven en una sola constante compartida (`lib/limits.ts`) y son
**exactamente los mismos** en el proyecto Next.js y en el prototipo web.
Si cambian ahí, cambian en los dos lados.

| Límite | Valor | Qué pasa si se excede |
| --- | --- | --- |
| Imágenes por lote | 30 | Semáforo rojo: Iniciar bloqueado hasta quitar imágenes o confirmar «Procesar solo las primeras que caben» (divide el lote: primeras en orden que respeten los 3 límites de lote). |
| Peso por imagen | 25 MB | Esa imagen se marca «Omitida» con su motivo y se excluye; el resto sigue (una imagen mala no pone rojo el lote). |
| Peso total del lote | 200 MB | Semáforo rojo: Iniciar bloqueado; se muestra cuánto sobra. |
| Megapíxeles por imagen | 100 MP | Esa imagen se marca «Omitida» con su motivo y se excluye; el resto sigue. |
| Megapíxeles totales del lote | 200 MP | Semáforo rojo: Iniciar bloqueado; se muestra cuántos MP sobran. |

El aviso de límites indica qué se excedió y por cuánto (nº de imágenes,
MB y MP que sobran). Las imágenes que quedan fuera del lote dividido se
marcan «Omitida» con el motivo.

### Resumen del lote y semáforo (cálculo previo)

En cuanto las imágenes tienen dimensiones conocidas (al cargarlas), se
muestra el panel **«Resumen del lote»**, siempre visible antes de Iniciar:

- **Nº de imágenes:** cargadas y válidas para procesar.
- **Tamaño total:** suma de `file.size` de todas las cargadas.
- **Megapíxeles totales:** suma de ancho × alto / 1 000 000.
- **Memoria est. de decodificación:** suma de ancho × alto × 4 bytes por
  imagen (un píxel RGBA en memoria). Es una estimación: Canvas usa además
  un búfer de salida del mismo tamaño, y el navegador guarda el blob
  original y el resultado, así que la memoria real al procesar una imagen
  puede ser ~2–3 veces esa cifra. Sirve para anticipar si el lote es
  pesado para el dispositivo, no como medida exacta.
- **Tiempo estimado:** megapíxeles de las candidatas × ~0,5 s por MP
  (escritorio). Es orientativo y varía según el dispositivo, el navegador,
  el formato de salida y los ajustes (filtros, marca de agua…).

Semáforo (calculado solo sobre las candidatas, es decir, las pendientes
que no superan el límite individual):

| Semáforo | Condición | Qué hace |
| --- | --- | --- |
| 🟢 Verde | ≤ 15 imágenes, ≤ 50 MB total y ≤ 50 MP total | «Listo, lote ligero». Iniciar disponible. |
| 🟡 Ámbar | Hasta 30 imágenes, 50–150 MB o 50–150 MP | Aviso visible: puede tardar; sugiere bajar la resolución de salida o dividir el lote, pero permite iniciar. |
| 🔴 Rojo | Supera cualquier límite duro (30 img / 200 MB / 200 MP) | Iniciar bloqueado hasta quitar imágenes o usar «Procesar solo las primeras que caben». |

Las imágenes que superan el límite individual (25 MB o 100 MP) no ponen
rojo el lote: se listan aparte como «se omitirán» con su motivo exacto y
el resto se puede procesar.

### Evitar cuelgues durante el proceso

- **Secuencial, una a una:** nunca en paralelo; cada imagen se procesa,
  se guarda su resultado y solo entonces empieza la siguiente.
- **Liberar memoria:** tras generar el blob, el lienzo se pone a 0×0
  (suelta su búfer) y el `ImageBitmap` se cierra. Las vistas previas se
  conservan para el comparador antes/después y los blobs de resultado se
  conservan porque el ZIP los necesita; su peso acumulado se muestra en
  el panel de progreso («En memoria para el ZIP: X») y todo se libera al
  pulsar «Limpiar» o al quitar una imagen.
- **Ceder a la UI entre imágenes:** `await setTimeout(0)` tras cada
  imagen, para que Cancelar y la barra de progreso respondan; nunca hay
  un bucle síncrono largo.

### Errores por imagen (el lote nunca se detiene por una imagen)

- **Antes de procesar (validación):** archivo no legible o corrupto
  (detectado al cargar, `createImageBitmap` falla), formato de salida no
  soportado (GIF nunca; AVIF se comprueba con una sonda 1×1 antes del lote),
  quitar fondo activado (no disponible, ver abajo) e imágenes que superan
  el límite individual (25 MB o 100 MP). Cada una muestra su motivo exacto
  en la lista y se excluye.
- **Durante el proceso:** `try/catch` por imagen. Si una falla, se marca
  «Error» con su motivo y se sigue con la siguiente.
- **Resumen final:** «X procesadas · Y con error · Z omitidas», más un
  desplegable con los motivos de las que fallaron.
- **Cancelar:** el botón «Cancelar» durante el proceso detiene lo que falta
  (termina la imagen actual) sin perder lo ya procesado, que se puede
  descargar.

### Aviso de lentitud

Durante el proceso hay cronómetro y progreso por imagen y total. Si una
imagen tarda más de **5 s** o el total más de **15 s**, aparece un aviso
visible: «Sigue trabajando, no cierres la pestaña…», con la opción de
cancelar. Si no hay progreso visible en más de **8 s** (una imagen muy
grande puede tardar sin que la barra avance), aparece el latido «Aún
procesando…». La UI no se bloquea: el aviso se actualiza con un
temporizador y el proceso cede a la UI entre imágenes (ver «Evitar
cuelgues» arriba).

### Quitar fondo (pendiente)

El toggle está visible pero la función **no está implementada** en esta
versión, a propósito, para no romper el build ni el tamaño del sitio:

- La librería habitual, `@imgly/background-removal`, descarga un modelo ONNX
  de ~40 MB la primera vez y tarda varios segundos por imagen; integrarla
  sin probarla en un navegador real habría sido prometer algo sin verificar.
- Si se activa el toggle, cada imagen se marca con ese error antes de
  procesar y se excluye del lote, sin detener las demás.
- Para activarlo de verdad: instalar `@imgly/background-removal`, hacer
  `import()` bajo demanda solo cuando el toggle esté on, y probar en Chrome
  de escritorio con imágenes de 1–2 MB antes de publicarlo.

## Stack

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind CSS 4**
- **Canvas API** para redimensionar, convertir, ajustar, rotar, recortar y
  marca de agua (sin servidor, sin Sharp)
- **JSZip** para generar el ZIP en el cliente
- Gestor de paquetes: **pnpm**

No se usa Sharp: Sharp necesita Node en el servidor y no encaja con un
despliegue estático en Cloudflare Pages, el hosting actual de NousLogic.

## Instalación y desarrollo

Requisitos: Node.js 18+ y pnpm.

```bash
cd editor-imagenes
pnpm install
pnpm dev
```

Abre http://localhost:3000

## Build de producción

```bash
pnpm build
```

Genera un sitio estático en `out/` (`output: "export"` en `next.config.ts`).

## Despliegue

### Cloudflare Pages (recomendado, hosting actual)

1. Sube el proyecto a un repositorio de GitHub.
2. En Cloudflare Pages → Create → Pages → conecta el repo.
3. Build command: `pnpm build`
4. Build output directory: `out`
5. (Opcional) variable de entorno `NODE_VERSION: 20` o superior.

Como el sitio es 100 % estático y no tiene funciones de servidor, no necesita
Workers ni configuración adicional.

### Vercel

1. Importa el repo en Vercel.
2. Framework: Next.js. Build command: `pnpm build`.
3. Con `output: "export"`, Vercel sirve el contenido de `out/` como sitio
   estático.

## Estructura

```
editor-imagenes/
├── app/
│   ├── layout.tsx      # Layout raíz (lang="es", metadatos)
│   ├── page.tsx        # Orquesta: subida, límites, procesado, cancelación,
│   │                   #   aviso de lentitud, resumen y descarga
│   └── globals.css     # Tailwind CSS 4
├── components/
│   ├── UploadArea.tsx      # Input múltiple + drag & drop
│   ├── SettingsPanel.tsx   # Formato, resolución, compresión + opciones extra
│   │                       #   (ajustes, rotación, filtros, recorte,
│   │                       #   marca de agua, fondo JPG, quitar fondo)
│   ├── RenamePanel.tsx     # Renombrado por lote + vista previa
│   └── ImageList.tsx       # Miniaturas, tamaños, errores y comparador
├── lib/
│   ├── types.ts            # Tipos, calidades, valores por defecto (los límites se reexportan desde limits.ts)
│   ├── limits.ts           # Límites unificados + resumen del lote + semáforo (una sola fuente de verdad)
│   ├── rename.ts           # Consecutivos numérico / alfabético / romano
│   └── imageProcessor.ts   # Canvas, ZIP y descarga (toda la lógica)
├── next.config.ts      # output: "export"
└── package.json
```

## Limitaciones reales (de Canvas, no de esta app)

- **GIF:** ningún navegador actual codifica GIF desde Canvas. Si se elige GIF
  como salida, la imagen dará error al procesar (se detecta porque
  `toBlob("image/gif")` devuelve PNG). La app lo avisa antes y por imagen.
- **AVIF:** la exportación depende del navegador (Chrome/Edge y Safari 16+
  lo soportan; en otros, `toBlob("image/avif")` devuelve PNG y se marca
  error). WebP es la alternativa segura y ligera.
- **PNG es sin pérdida:** el nivel de compresión no cambia su calidad, solo
  se reduce el peso al bajar la resolución.
- **JPEG no admite transparencia:** el fondo transparente se rellena con el
  color de fondo elegido (blanco por defecto).
- **Formatos de entrada:** depende de lo que el navegador pueda decodificar
  (`createImageBitmap`); formatos raros (TIFF, HEIC en algunos navegadores)
  pueden dar error por imagen.
- **Imágenes muy grandes:** el procesado es en memoria; imágenes de decenas
  de megapíxeles pueden tardar o fallar en móviles con poca RAM.
- **Filtro Canvas:** `ctx.filter` funciona en Chrome/Edge/Firefox; en
  Safari puede ignorarse en versiones antiguas (los ajustes/filtros no se
  aplicarían, pero el resto del procesado sí).

## Opciones que se pueden integrar después (open source, en el navegador)

Ideas sugeridas, todas viables sin servidor:

- **Quitar fondo** con `@imgly/background-removal` (ver pendiente arriba).
- **Recorte interactivo** con arrastre (p. ej. `react-easy-crop`) en lugar
  del recorte centrado por proporción actual.
- **Compresión inteligente:** probar varias calidades y quedarse con la más
  pequeña por debajo de un umbral de calidad (con `SSIM` aproximado o por
  tamaño objetivo en KB).
- **Optimización PNG sin pérdida** con `UPNG.js` o `pngquant` vía WASM
  (`@squoosh/lib` / `wasm-imagemagick`).
- **Conversión a ICO / favicon** y a PDF (con `jsPDF`) a partir de las
  imágenes procesadas.
- **Metadatos EXIF:** leer orientación con `exifr` y opción de conservar o
  eliminar metadatos.
- **Presets para redes sociales** (1080×1080, 1920×1080, stories 1080×1920…).

## Qué NO se ha probado (honesto)

No hay navegador en este entorno para subir una imagen real, procesarla ni
descargar el ZIP. Verificado: `pnpm install` y `pnpm build` (TypeScript +
export estático en `out/`), más una prueba en Node de la lógica pura de
`lib/limits.ts` (15 comprobaciones: semáforo verde/ámbar/rojo, corte del
subconjunto que cabe por nº de imágenes, MB y MP, y omisión individual por
25 MB / 100 MP — todas pasaron). Pendiente de prueba en PC/móvil real:
subir y procesar imágenes en Chrome, el flujo completo con ZIP, AVIF/GIF en
cada navegador, el comparador antes/después, el renombrado con los 3 tipos
de consecutivo, la cancelación a mitad de lote, el aviso de lentitud y el
latido con imágenes grandes, y el panel «Resumen del lote» con un lote
pesado (ámbar/rojo).
