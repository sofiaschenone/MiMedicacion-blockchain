/**
 * @file resumen.js
 * @description Resumen fiel del lote diario de anclaje: distingue los registros
 *              anclados en esta corrida, los que ya estaban anclados y los que
 *              fallaron, para que el cierre del proceso no anuncie un éxito que
 *              no ocurrió ni trate un anclaje previo como un fallo. Función pura,
 *              sin dependencias ni acceso a red.
 * @institution Universidad Provincial de Ezeiza (UPE) - Proyecto MiMedicación
 */

// Resultado de un paciente. Es la única clasificación que consume el resumen:
// "YA_ANCLADO" no es un éxito de esta corrida ni un fallo, es un lote sin cambios.
const RESULTADO_ANCLADO = "ANCLADO";
const RESULTADO_YA_ANCLADO = "YA_ANCLADO";
const RESULTADO_FALLIDO = "FALLIDO";

const ESTADO_SIN_REGISTROS = "SIN_REGISTROS";
const ESTADO_EXITO = "EXITO";
const ESTADO_PARCIAL = "PARCIAL";
const ESTADO_TODOS_FALLIDOS = "TODOS_FALLIDOS";
const ESTADO_SIN_CAMBIOS = "SIN_CAMBIOS";

const ETIQUETA_DE_CIERRE = "[CRON JOB FINALIZADO]";

// Textos de cierre agrupados por estado, igual que los textos de diagnóstico de
// blockchainService. Cada uno recibe los conteos y las cifras ya formateadas.
const TEXTOS_DE_CIERRE = {
  [ESTADO_SIN_REGISTROS]: ({ cifras }) =>
    `📭 ${ETIQUETA_DE_CIERRE} No había registros para procesar: el lote quedó vacío ${cifras}.`,

  [ESTADO_EXITO]: ({ anclados, yaAnclados, cifras }) =>
    `🎉 ${ETIQUETA_DE_CIERRE} Lote completo sin fallos: ${anclados} registros se anclaron en esta corrida y ${yaAnclados} ya estaban anclados ${cifras}.`,

  [ESTADO_PARCIAL]: ({ anclados, procesados, fallidos, cifras }) =>
    `⚠️ ${ETIQUETA_DE_CIERRE} Resultado parcial: se anclaron ${anclados} de ${procesados} registros y fallaron ${fallidos} ${cifras}.`,

  [ESTADO_TODOS_FALLIDOS]: ({ procesados, cifras }) =>
    `❌ ${ETIQUETA_DE_CIERRE} No se ancló ningún registro en esta corrida: fallaron los ${procesados} procesados ${cifras}.`,

  [ESTADO_SIN_CAMBIOS]: ({ yaAnclados, cifras }) =>
    `🕓 ${ETIQUETA_DE_CIERRE} Sin cambios: los ${yaAnclados} registros ya estaban anclados de una corrida anterior; no hubo anclajes nuevos ni fallos ${cifras}.`,
};

/**
 * Elige el estado del cierre a partir de los cuatro conteos.
 *
 * El orden importa: un lote vacío no es un éxito; todos fallidos no es parcial;
 * cualquier fallo con algún registro no fallido es parcial; y si no hubo ni
 * anclajes nuevos ni fallos, el lote quedó sin cambios.
 *
 * @param {{procesados: number, anclados: number, yaAnclados: number, fallidos: number}} conteos
 * @returns {string} Uno de los estados de cierre
 */
function estadoDelLote({ procesados, anclados, fallidos }) {
  if (procesados === 0) {
    return ESTADO_SIN_REGISTROS;
  }
  if (fallidos === procesados) {
    return ESTADO_TODOS_FALLIDOS;
  }
  if (fallidos > 0) {
    return ESTADO_PARCIAL;
  }
  if (anclados === 0) {
    return ESTADO_SIN_CAMBIOS;
  }
  return ESTADO_EXITO;
}

/**
 * Resume el resultado del lote diario a partir de un resultado por paciente.
 *
 * Cada resultado tiene la forma `{ resultado: "ANCLADO" | "YA_ANCLADO" | "FALLIDO" }`.
 * La función no lee ni escribe estado externo: sólo cuenta y elige el encabezado
 * que corresponde. Los mensajes de error por paciente se imprimen en el catch de
 * quien llama, no forman parte de este contrato.
 *
 * @param {Array<{resultado: "ANCLADO"|"YA_ANCLADO"|"FALLIDO"}>} resultados
 *   Resultados por paciente, en el orden en que se procesaron
 * @returns {{procesados: number, anclados: number, yaAnclados: number, fallidos: number, estado: string, encabezado: string}}
 *   Conteos del lote, estado del cierre y el texto que debe imprimirse
 * @throws {Error} Si `resultados` no es un arreglo
 */
function resumirLote(resultados) {
  if (!Array.isArray(resultados)) {
    throw new Error(
      "Resumen del lote inválido: se esperaba un arreglo con un resultado por paciente."
    );
  }

  const procesados = resultados.length;
  const anclados = resultados.filter(
    (resultado) => resultado !== null && resultado.resultado === RESULTADO_ANCLADO
  ).length;
  const yaAnclados = resultados.filter(
    (resultado) => resultado !== null && resultado.resultado === RESULTADO_YA_ANCLADO
  ).length;
  // Un resultado ausente o desconocido no puede presentarse como anclado: cuenta
  // como fallido para no inflar el cierre.
  const fallidos = procesados - anclados - yaAnclados;

  const conteos = { procesados, anclados, yaAnclados, fallidos };
  const estado = estadoDelLote(conteos);

  // Las cuatro cifras van en todos los encabezados: el operador no tiene que
  // inferir el resultado del lote a partir del tono del mensaje.
  const cifras = `(procesados: ${procesados}, anclados: ${anclados}, yaAnclados: ${yaAnclados}, fallidos: ${fallidos})`;

  return {
    ...conteos,
    estado,
    encabezado: TEXTOS_DE_CIERRE[estado]({ ...conteos, cifras }),
  };
}

module.exports = {
  resumirLote,
  RESULTADO_ANCLADO,
  RESULTADO_YA_ANCLADO,
  RESULTADO_FALLIDO,
  ESTADO_SIN_REGISTROS,
  ESTADO_EXITO,
  ESTADO_PARCIAL,
  ESTADO_TODOS_FALLIDOS,
  ESTADO_SIN_CAMBIOS,
};
