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
   - **Quitar fondo:** desactivado por defecto; con IA en el navegador
     (ISNet int8, Apache-2.0, ver «Quitar fondo» más abajo). Si el formato
     es JPG, la salida se fuerza a PNG.
   - **Comparador antes/después:** en cada imagen procesada, botón
     «Comparar antes / después» con deslizador.
   - **Vista previa en vivo:** tira de miniaturas clicables (y desplegable)
     para elegir la imagen, con deslizador antes/después y botones solo
     Antes / solo Después. Se actualiza sola al cambiar cualquier
     configuración (ver «Vista previa en vivo» más abajo).
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
  el modelo de quitar fondo no se pudo descargar o la inferencia falló (esa
  imagen muestra su motivo exacto) e imágenes que superan el límite
  individual (25 MB o 100 MP). Cada una muestra su motivo exacto en la
  lista y se excluye.
- **Durante el proceso:** `try/catch` por imagen. Si una falla, se marca
  «Error» con su motivo y se sigue con la siguiente.
- **Resumen final:** «X procesadas · Y con error · Z omitidas», más un
  desplegable con los motivos de las que fallaron.
- **Cancelar:** el botón «Cancelar» durante el proceso detiene lo que falta
  (termina la imagen actual) sin perder lo ya procesado, que se puede
  descargar.

### Vista previa en vivo

Antes de pulsar Iniciar, el panel **«Vista previa en vivo»** muestra cómo
quedará una imagen con la configuración activa, sin procesar el lote:

- **Selector:** tira de miniaturas clicables con todas las imágenes
  cargadas (y un desplegable «Imagen N de M»); por defecto la primera. Al
  cambiar de imagen cambia el preview; si se quita la elegida, pasa a la
  primera disponible. Funciona con 1 o con 30 imágenes.
- **Antes / después en todos los casos:** deslizador arrastrable (también
  se puede arrastrar sobre la imagen o usar la barra) que divide la imagen
  — izquierda original, derecha procesada, con etiquetas «Antes» y
  «Después» — más botones para ver solo Antes, solo Después o el
  comparador. Debajo: dimensiones y peso original frente a dimensiones
  reales de salida, formato y peso del resultado, con el % ahorrado.
- **En vivo:** al cambiar formato, resolución, compresión, ajustes,
  rotación, filtro, marca de agua o recorte, la preview se regenera sola
  con un retraso de ~300 ms (debounce) y el indicador «Actualizando
  preview…». Usa el **mismo pipeline que el lote**
  (`lib/imageProcessor.ts` → `processImage`), así que lo que se ve es lo
  que saldrá al pulsar Iniciar.
- **Si falla:** p. ej. GIF no exportable o AVIF no soportado, el panel
  muestra el motivo exacto sin romper el resto.
- **Rendimiento:** la imagen en pantalla se ve escalada con CSS; si la
  salida real es muy grande (más de 25 MP o lado mayor de 1600 px), la
  preview se genera a resolución reducida para no colgar el navegador y se
  avisa («aprox.» en el peso); las dimensiones mostradas siguen siendo las
  reales de salida. El preview **no** corre en paralelo con el lote: si el
  lote está corriendo, se pausa y muestra «Preview en pausa mientras
  procesa el lote», y se actualiza sola al terminar.

### Aviso de lentitud

Durante el proceso hay cronómetro y progreso por imagen y total. Si una
imagen tarda más de **5 s** o el total más de **15 s**, aparece un aviso
visible: «Sigue trabajando, no cierres la pestaña…», con la opción de
cancelar. Si no hay progreso visible en más de **8 s** (una imagen muy
grande puede tardar sin que la barra avance), aparece el latido «Aún
procesando…». La UI no se bloquea: el aviso se actualiza con un
temporizador y el proceso cede a la UI entre imágenes (ver «Evitar
cuelgues» arriba).

### Quitar fondo (implementado, IA en el navegador)

El toggle activa el recorte del fondo con el modelo **ISNet general-use
int8 (ORMBG, onnx-community), ~44 MB, Apache-2.0**, ejecutado con
**onnxruntime-web (MIT)** en el navegador. La inferencia es local: solo
se descarga el modelo, las imágenes nunca salen del dispositivo.

- **Vía permisiva (a propósito):** NO se usa `@imgly/background-removal`
  (AGPL-3.0: obligaría a ofrecer el código fuente a los usuarios) ni RMBG
  de BRIA (CC BY-NC, solo no comercial). El modelo ISNet es Apache-2.0 y
  onnxruntime-web es MIT: uso comercial permitido, con atribución (ver
  `NOTICE.md` y el pie de la página).
- **Modelo elegido y verificado (2026-11-22):**
  `https://huggingface.co/onnx-community/ormbg-ONNX/resolve/main/onnx/model_quantized.onnx`
  → HTTP 200, 44.315.205 bytes. La URL de rembg en GitHub
  (`isnet-general-use.onnx`) también responde 200, pero es el modelo
  completo de ~179 MB y solo es reserva. La URL de Hugging Face
  `imgly/isnet-general-onnx/resolve/main/model.onnx` dio 404 y no se usa.
  El `.onnx` NO se sube al repo ni a `public/` (Cloudflare Pages tiene
  límite de 25 MB por archivo); se descarga en tiempo de ejecución.
- **Descarga:** solo la primera vez que se activa quitar fondo (o al
  pulsar Iniciar con el toggle on), con barra de progreso y porcentaje;
  queda guardado en la Cache Storage del navegador (`nouspixel-bg-model-v1`)
  para las siguientes veces. Si la descarga falla, se puede reintentar con
  el botón «Reintentar descarga» y el error queda guardado (no se
  re-descarga en cada imagen).
- **Pipeline (`lib/backgroundRemoval.ts`):** la región recortada se
  redimensiona a 1024×1024, los píxeles van en [0, 1] (pixel / 255, sin
  normalización por media/desviación, tal como indica el
  `preprocessor_config.json` del propio modelo), entrada `pixel_values`,
  salida `alphas` [1,1,1024,1024]; la máscara se aplica a la imagen con
  la misma transformación (recorte, rotación, volteo) mediante
  `destination-in`. Salida con transparencia: si el formato es JPG, se
  fuerza a PNG (y se avisa en la UI y en los nombres de archivo).
- **Runtime WASM:** se importa el entry point solo-WASM
  (`onnxruntime-web/wasm`): Next.js emite `ort-wasm-simd-threaded.wasm`
  (~15 MB, dentro del límite de 25 MB por archivo de Cloudflare Pages)
  y el loader lo carga desde el mismo origen. Importar el paquete
  completo emitiría además el wasm de WebGPU (29 MB) y rompería el
  despliegue en Pages. Sin COOP/COEP el WASM corre a **1 hilo**: más
  lento, pero funciona en cualquier navegador moderno.
- **Rendimiento:** la inferencia tarda varios segundos por imagen
  (en Node, a 1 hilo: ~9 s para 1024×1024). La vista previa también usa
  quitar fondo si está activado (mismo pipeline), así que al mover un
  ajuste puede tardar; el lote procesa de una en una como siempre.
- **Verificación del modelo (2026-11-22):** con una foto real, la máscara
  dio media 0,725 en el centro (sujeto) y 0,000 en las esquinas (fondo),
  y la composición se verificó visualmente (sujeto recortado limpio,
  pelo y ropa incluidos). Sin navegador en este entorno no se pudo probar
  la descarga del modelo ni un recorte real en la página: pendiente de
  prueba en PC/móvil real.
- **Limitaciones:** el recorte es peor en pelo fino, cristal y bordes
  suaves; imágenes muy grandes se procesan igual (la máscara se calcula a
  1024 y se reescala); si el CDN de Hugging Face o el de jsDelivr no
  responde, la imagen se marca con su motivo y el lote continúa sin
  quitarle el fondo a esa imagen.

### Donaciones

Al pie de la página, la sección **«Apoya NousPixel»** enlaza tres formas
de donar, cada una con botón «Abrir» y botón «Copiar enlace»:

- PayPal: https://www.paypal.com/paypalme/engelarm
- Buy Me a Coffee: https://buymeacoffee.com/engelarm
- NousLogic: https://nouslogic.xyz/dona-un-cafe

La donación es voluntaria y ninguna función está bloqueada por donar.
No hay publicidad (AdSense) en esta versión.

## Stack

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind CSS 4**
- **Canvas API** para redimensionar, convertir, ajustar, rotar, recortar y
  marca de agua (sin servidor, sin Sharp)
- **JSZip** para generar el ZIP en el cliente
- **onnxruntime-web** (MIT) para quitar fondo con el modelo ISNet int8
  (Apache-2.0), cargado bajo demanda desde CDN
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
│   ├── PreviewPanel.tsx    # Vista previa en vivo: selector, deslizador
│   │                       #   antes/después, debounce y pausa durante el lote
│   ├── ImageList.tsx       # Miniaturas, tamaños, errores y comparador
│   └── Donations.tsx       # Sección «Apoya NousPixel» (PayPal, Buy Me a
│                           #   Coffee, NousLogic), con copiar enlace
├── lib/
│   ├── types.ts            # Tipos, calidades, valores por defecto (los límites se reexportan desde limits.ts)
│   ├── preview.ts          # Vista previa: mismo pipeline que el lote, con
│   │                       #   tope de 1600 px / 25 MP para no colgar el navegador
│   ├── limits.ts           # Límites unificados + resumen del lote + semáforo (una sola fuente de verdad)
│   ├── rename.ts           # Consecutivos numérico / alfabético / romano
│   ├── backgroundRemoval.ts # Quitar fondo: modelo ISNet int8 (Apache-2.0)
│   │                       #   + onnxruntime-web, descarga perezosa y caché
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

- **Quitar fondo** ya implementado (ver «Quitar fondo» arriba).
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
latido con imágenes grandes, el panel «Resumen del lote» con un lote
pesado (ámbar/rojo), y la vista previa en vivo (debounce al cambiar
ajustes, deslizador, selector entre varias imágenes y pausa durante el
lote). Tampoco se pudo probar en navegador real la descarga del modelo de
quitar fondo (~44 MB) ni un recorte real en la página: el modelo y el
preprocesado sí se verificaron en Node con onnxruntime-web y una foto
real (máscara correcta, ver «Quitar fondo» arriba), pero la descarga
desde Hugging Face, la carga del WASM emitido por Next.js y la
inferencia en el navegador quedan pendientes de prueba en PC/móvil real.
