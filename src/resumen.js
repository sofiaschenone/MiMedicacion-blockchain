/**
 * @file resumen.js
 * @description Resumen fiel del lote diario de anclaje: distingue cuántos registros
 *              se intentaron, cuántos se anclaron y cuántos fallaron, para que el
 *              cierre del proceso no anuncie un éxito que no ocurrió. Función pura,
 *              sin dependencias ni acceso a red.
 * @institution Universidad Provincial de Ezeiza (UPE) - Proyecto MiMedicación
 */

const ESTADO_SIN_REGISTROS = "SIN_REGISTROS";
const ESTADO_EXITO = "EXITO";
const ESTADO_PARCIAL = "PARCIAL";
const ESTADO_NINGUNO = "NINGUNO";

const ETIQUETA_DE_CIERRE = "[CRON JOB FINALIZADO]";

/**
 * Resume el resultado del lote diario a partir de un resultado por paciente.
 *
 * Cada resultado tiene la forma `{ paciente, exito, motivo }`, donde `motivo` es
 * el mensaje de error cuando el paciente falló. La función no lee ni escribe
 * estado externo: sólo cuenta y elige el encabezado que corresponde.
 *
 * @param {Array<{paciente: string, exito: boolean, motivo?: string|null}>} resultados
 *   Resultados por paciente, en el orden en que se procesaron
 * @returns {{procesados: number, exitosos: number, fallidos: number, estado: string, encabezado: string}}
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
  const exitosos = resultados.filter(
    (resultado) => resultado !== null && resultado.exito === true
  ).length;
  const fallidos = procesados - exitosos;

  // Las tres cifras van en todos los encabezados: el operador no tiene que
  // inferir el resultado del lote a partir del tono del mensaje.
  const cifras = `(procesados: ${procesados}, exitosos: ${exitosos}, fallidos: ${fallidos})`;

  if (procesados === 0) {
    return {
      procesados,
      exitosos,
      fallidos,
      estado: ESTADO_SIN_REGISTROS,
      encabezado: `📭 ${ETIQUETA_DE_CIERRE} No había registros para procesar: el lote quedó vacío ${cifras}.`,
    };
  }

  if (fallidos === 0) {
    return {
      procesados,
      exitosos,
      fallidos,
      estado: ESTADO_EXITO,
      encabezado: `🎉 ${ETIQUETA_DE_CIERRE} Lote completo: los ${procesados} registros se anclaron con éxito ${cifras}.`,
    };
  }

  if (exitosos === 0) {
    return {
      procesados,
      exitosos,
      fallidos,
      estado: ESTADO_NINGUNO,
      encabezado: `❌ ${ETIQUETA_DE_CIERRE} No se ancló ningún registro: fallaron los ${fallidos} procesados ${cifras}.`,
    };
  }

  return {
    procesados,
    exitosos,
    fallidos,
    estado: ESTADO_PARCIAL,
    encabezado: `⚠️ ${ETIQUETA_DE_CIERRE} Resultado parcial: se anclaron ${exitosos} de ${procesados} registros y fallaron ${fallidos} ${cifras}.`,
  };
}

module.exports = {
  resumirLote,
  ESTADO_SIN_REGISTROS,
  ESTADO_EXITO,
  ESTADO_PARCIAL,
  ESTADO_NINGUNO,
};
