# Ford-Fulkerson interactivo

Aplicacion web interactiva que permite construir una red de flujo (de forma manual o aleatoria), seleccionar sus vertices fuente y sumidero, y ejecutar el algoritmo de Ford-Fulkerson paso a paso, observando la etiquetacion de vertices, la actualizacion de los flujos y la verificacion final mediante el Teorema del Flujo Maximo y Corte Minimo.

Proyecto desarrollado para el curso de Matematica Computacional (UPC).

## Funcionalidades

- Configuracion del numero de nodos (entre 7 y 16) y eleccion entre grafo manual o aleatorio.
- Editor de grafo: colocar nodos en un lienzo y crear aristas con capacidad, por clic o por formulario.
- Validacion automatica de aciclicidad: rechaza cualquier arista que forme un ciclo.
- Seleccion de una o varias fuentes y uno o varios sumideros, con insercion automatica de un origen ficticio S y/o un destino ficticio T (arcos de capacidad infinita) cuando hay mas de uno de cada tipo.
- Ejecucion del algoritmo paso a paso con la notacion de etiquetas de la lectura del curso: `(a+, delta(x))` y `(a-, delta(x))`.
- Modo automatico para resolver todas las iteraciones de una vez.
- Verificacion final del flujo maximo mediante el corte minimo, con `|f| = c(S,T)` resaltado sobre el grafo.
- Tabla de flujo final por arista, historial completo de caminos de aumento, y aporte por fuente/sumidero real cuando se usan nodos ficticios.

## Como usarlo

No requiere instalacion ni dependencias. Basta con abrir `index.html` en cualquier navegador moderno (Chrome, Firefox, Edge).

```
git clone https://github.com/<tu-usuario>/ford-fulkerson-app.git
cd ford-fulkerson-app
# abrir index.html con doble clic, o:
python3 -m http.server 8000   # y luego entrar a http://localhost:8000
```

## Tecnologias

HTML, CSS y JavaScript nativo (sin frameworks ni librerias externas). El grafo se dibuja con SVG directamente en el DOM.

- `index.html` - estructura de las 5 pantallas de la aplicacion.
- `estilos.css` - estilos visuales.
- `logica.js` - estado de la aplicacion, deteccion de ciclos, motor del algoritmo de Ford-Fulkerson (busqueda de caminos de aumento por BFS sobre la red residual, actualizacion de flujos, calculo del corte minimo) y renderizado del grafo.

## Fundamento teorico

La implementacion sigue el metodo de etiquetacion de vertices y los 9 pasos del algoritmo de Ford-Fulkerson, verificando el resultado mediante el Teorema del Flujo Maximo y Corte Minimo. La busqueda del camino de aumento se realiza mediante un recorrido en anchura (BFS) sobre la red residual, equivalente a la variante conocida como algoritmo de Edmonds-Karp.

## Licencia

MIT
