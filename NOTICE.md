NOTICE — NousPixel
====================

Este proyecto usa software de terceros con sus propias licencias.
El código propio de NousPixel no incluye copias de esos proyectos salvo
lo indicado; los modelos y runtimes se descargan en tiempo de ejecución
desde sus fuentes oficiales.

1. Modelo de quitar fondo: ISNet general-use int8 (ORMBG)
   - Fuente: https://huggingface.co/onnx-community/ormbg-ONNX
     (archivo onnx/model_quantized.onnx, ~44 MB)
   - Modelo: IS-Net / DIS, de Qin, Dai, Hu, Fan, Shao y Van Gool,
     "Highly Accurate Dichotomous Image Segmentation", ECCV 2022.
   - Licencia: Apache License 2.0
     (https://github.com/xuebinqin/DIS/blob/main/LICENSE.md).
     Se permite el uso comercial con atribución; no se ha modificado
     el modelo. La exportación a ONNX es de imgly GmbH (MIT).
   - NO se usa RMBG de BRIA (CC BY-NC, solo no comercial) ni la
     librería @imgly/background-removal (AGPL-3.0).

2. ONNX Runtime Web (onnxruntime-web)
   - Licencia: MIT License (https://github.com/microsoft/onnxruntime).
   - Se carga bajo demanda (entry point solo-WASM) y su runtime WASM
     lo emite Next.js en el propio sitio; se ejecuta 100% en el
     navegador del usuario.

3. Otras dependencias (ver package.json)
   - Next.js, React, Tailwind CSS, JSZip: licencias MIT (o Apache-2.0
     en el caso de partes de Next.js). Todas permiten el uso comercial.

Atribución en la página: el pie de NousPixel indica el modelo ISNet
(Apache-2.0) y ONNX Runtime Web (MIT) usados para quitar el fondo.
