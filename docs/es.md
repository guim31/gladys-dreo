# Dreo

Controle sus ventiladores, calefactores, purificadores de aire y humidificadores **Dreo** desde Gladys, a través
de la nube de Dreo — el mismo servicio que utiliza la aplicación Dreo. Los estados llegan en tiempo real: una
velocidad cambiada con el mando o en la aplicación aparece en Gladys en un segundo.

> Esta integración se ha **desarrollado sin el hardware**: se basa en respuestas reales de la nube de Dreo
> publicadas por el proyecto de Home Assistant `hass-dreo`. Sus comentarios son bienvenidos, en el foro de Gladys
> o en un issue de GitHub. **No está afiliada a Dreo**.

## Presentación

| Aparato Dreo                                                  | Lo que obtiene en Gladys                                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ventiladores de torre (DR-HTF…)                               | encendido, velocidad, modo, oscilación, temperatura de la habitación                                                                             |
| Circuladores de aire / ventiladores de pie (DR-HAF…, DR-HPF…) | encendido, velocidad, modo, oscilación (horizontal y vertical), temperatura de la habitación                                                     |
| Ventiladores de techo (DR-HCF…)                               | encendido del ventilador, velocidad, modo (incluido inverso)                                                                                     |
| Calefactores (DR-HSH…, WH…)                                   | encendido (vea la parte de seguridad), temperatura objetivo, modo, nivel de calor, temperatura de la habitación, bloqueo infantil (solo lectura) |
| Purificadores de aire (DR-HAP…)                               | encendido, velocidad, modo, PM2.5, vida útil del filtro (si se indica en %)                                                                      |
| Humidificadores (DR-HHM…)                                     | encendido, modo, humedad objetivo, nivel de vapor, humedad, depósito o nivel de agua                                                             |

Los demás productos Dreo (aires acondicionados, deshumidificadores, ventiladores nebulizadores, cocinas) aparecen
con el botón «Actualizar los aparatos» como «aún no compatible».

## Requisitos

- Gladys Assistant 5.1.0 o posterior.
- Una cuenta Dreo, con los aparatos configurados en la aplicación Dreo (wifi, habitación…).
- Acceso a Internet para Gladys: todo pasa por la nube de Dreo.

## Configuración

1. En Gladys, **Integraciones → Instalar desde GitHub**, e introduzca `https://github.com/guim31/gladys-dreo`.
2. En la pantalla de configuración, introduzca la **dirección de correo** y la **contraseña** de su cuenta Dreo.
3. **Región de la cuenta**: Europa o Norteamérica. Si se equivoca, la integración cambia por sí sola.
4. **Idioma de los nombres de funciones**: los nombres dados a las funciones al añadir un aparato (francés por
   defecto).
5. **Permitir encender las calefacciones desde Gladys**: desactivado por defecto, vea más abajo.
6. Abra la pestaña **Descubrimiento** y añada los aparatos que desee.

La contraseña solo sirve para iniciar sesión; la integración guarda el token de sesión en su volumen privado
`/data` y solo vuelve a iniciar sesión cuando Dreo lo pide.

## Aparatos

El encendido es un interruptor normal. El **modo** es una lista de los modos que su modelo tiene realmente
(normal, natural, sueño, automático, turbo…). Las velocidades van de 1 al máximo de su modelo. Las temperaturas se
convierten a grados Celsius.

### Ventiladores

La **oscilación** utiliza el ajuste de oscilación de ventiladores de Gladys: _apagada_ o _izquierda-derecha_ en los
ventiladores de torre, además de _arriba-abajo_ y _ambas_ en los circuladores de aire inclinables. En los
ventiladores de techo con luz, encender el ventilador nunca enciende la luz.

### Calefactores

Por su seguridad, **un calefactor no se puede encender desde Gladys**, salvo que active «Permitir encender las
calefacciones desde Gladys»: puede que nadie esté en la habitación para vigilarlo. **Apagarlo**, cambiar su
**temperatura objetivo** y supervisarlo funcionan siempre. Mientras un calefactor está apagado y la opción
desactivada, tampoco se pueden cambiar su modo ni su nivel de calor (algunos modelos podrían arrancar al recibir un
modo). El **bloqueo infantil** se muestra, nunca se controla. Los calefactores Dreo siguen la temperatura objetivo
en modo **Eco**; en modo **Calefacción** siguen el nivel de calor (H1, H2…).

### Purificadores de aire

Las PM2.5 se expresan en µg/m³. Los purificadores que necesitan una orden «auto» especial (`auto-regular`,
`auto-silent`) la reciben automáticamente. La vida útil del filtro aparece en los modelos que la indican en
porcentaje.

### Humidificadores

La humedad objetivo (30 a 90 %) es la del modo actual (automático o sueño). El depósito muestra _Bajo_ cuando está
vacío; los modelos con indicador muestran en su lugar el nivel en porcentaje.

## Widget

El widget **Aparatos Dreo** muestra todos los aparatos Dreo añadidos a Gladys en una tarjeta — encendidos, apagados
o desconectados, con su modo, su velocidad y su temperatura — y un botón **Apagar todo** (con confirmación). Añádalo
desde el editor del panel.

## Disparador de escena

**Aparato Dreo conectado o desconectado**: un aparato ha perdido su conexión con la nube de Dreo (desenchufado, wifi
caído) o la ha recuperado. Elija un aparato y/o el cambio, o déjelos vacíos. Variables: el nombre del aparato y el
nuevo estado (`online` u `offline`).

## Acción de escena

**Apagar los aparatos Dreo**: apaga todos los aparatos Dreo añadidos a Gladys que estén encendidos, o solo los tipos
elegidos (ventiladores, calefactores, purificadores, humidificadores). Salida: el número de aparatos apagados.

## Ejemplos de escenas

- **Salir de casa**: cuando sale la última persona, ejecute _Apagar los aparatos Dreo_ con el tipo _Calefactores_ y
  envíese un mensaje con el número de aparatos apagados.
- **Demasiado calor en el dormitorio**: cuando la temperatura del dormitorio supera los 26 °C después de las 22 h,
  encienda el ventilador de torre en modo _Sueño_ a la velocidad 2.
- **Calefactor desenchufado**: cuando el calefactor del salón se desconecta, envíe una notificación.
- **Aire seco**: cuando la humedad medida por el humidificador baja de 35 %, ajuste su humedad objetivo a 50 %.

## Cómo se mantienen los estados al día

La integración mantiene un WebSocket abierto con la nube de Dreo, como la aplicación: los cambios llegan al
instante. Cada 10 minutos también vuelve a leer el estado de los aparatos añadidos a Gladys, por si se perdió un
evento, y vuelve a enviar un valor sin cambios cada 6 horas para que Gladys nunca muestre «Sin valor reciente». Dreo
no publica ninguna cuota para esta API: la integración se queda muy por debajo de lo que hace la aplicación (un
inicio de sesión y luego una petición por aparato cada 10 minutos), y solo envía a Gladys los valores que cambian.

## Solución de problemas

- **«Dreo ha rechazado la dirección de correo o la contraseña»**: compruébelas en la aplicación Dreo; la integración
  no vuelve a intentarlo sola, para no bloquear su cuenta. Guarde de nuevo la configuración para reintentarlo.
- **«No se puede acceder a la nube de Dreo»**: compruebe el acceso a Internet de Gladys; la integración lo vuelve a
  intentar cada minuto, y luego cada vez menos.
- **Una orden falla con «no ha confirmado»**: puede que el aparato esté desconectado u ocupado; compruébelo en la
  aplicación Dreo.
- **Un calefactor no responde**: los calefactores Dreo desactivan el control remoto tras 24 horas sin uso (norma de
  seguridad); pulse el botón wifi del calefactor.
- **Falta un aparato**: pulse «Actualizar los aparatos» en la pantalla de configuración y mire la pestaña
  Descubrimiento.
- Para más detalles, defina la variable de entorno `LOG_LEVEL=debug` y lea los registros de la integración: nunca
  contienen su contraseña ni su token.

## Limitaciones

- Desarrollada sin el hardware: los modelos son los de `hass-dreo`, los límites de un modelo ausente de sus tablas
  son estimaciones.
- Solo nube: sin control local, nada funciona sin Internet.
- Las luces de los ventiladores de techo, las luces ambientales, los temporizadores y los ajustes de pantalla y
  sonido no están disponibles.
- Los aires acondicionados, deshumidificadores, ventiladores nebulizadores y cocinas aún no son compatibles.
- Dreo indica las temperaturas en °F: la conversión redondea a 0,1 °C, y la temperatura objetivo al grado.
- La API de la nube de Dreo no es pública: Dreo puede cambiarla sin previo aviso.
