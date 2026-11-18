/**
 * @file validacion.js
 * @description Única definición de "fecha de registro" para MiMedicación: día calendario
 *              en America/Argentina/Buenos_Aires, con formato "YYYY-MM-DD" y existencia
 *              real en el calendario. Sin dependencias externas.
 * @institution Universidad Provincial de Ezeiza (UPE) - Proyecto MiMedicación
 */

const ZONA_HORARIA_ARGENTINA = "America/Argentina/Buenos_Aires";

// Formato estricto: cuatro dígitos de año, dos de mes y dos de día, separados por guiones.
const FORMATO_FECHA_REGISTRO = /^\d{4}-\d{2}-\d{2}$/;

// Se formatea por partes con zona horaria explícita. No se usa toISOString (UTC) ni
// toLocaleDateString (dependiente del locale del sistema).
const formateadorDiaArgentino = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_HORARIA_ARGENTINA,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Valida que una fecha sea una fecha de registro: texto "YYYY-MM-DD" que además
 * exista de verdad en el calendario gregoriano.
 *
 * @param {string} fecha - Fecha candidata, por ejemplo "2026-11-13"
 * @returns {void} No devuelve nada si la fecha es válida
 * @throws {Error} Si la fecha no es un texto con formato válido o no existe en el calendario
 */
function validarFechaRegistro(fecha) {
  if (typeof fecha !== "string") {
    throw new Error(
      `Fecha de registro inválida: se esperaba un texto con formato "YYYY-MM-DD" y se recibió ${tipoDeDato(fecha)}.`
    );
  }

  if (!FORMATO_FECHA_REGISTRO.test(fecha)) {
    throw new Error(
      `Fecha de registro inválida: "${fecha}" no respeta el formato "YYYY-MM-DD".`
    );
  }

  const [anio, mes, dia] = fecha.split("-").map(Number);

  // Se comprueba la ida y vuelta contra el calendario real. Date.UTC y el constructor
  // de Date hacen rollover (por ejemplo "2026-02-31" pasa a marzo), así que si algún
  // componente cambió, la fecha no existe.
  const comprobacion = new Date(0);
  comprobacion.setUTCHours(0, 0, 0, 0);
  comprobacion.setUTCFullYear(anio, mes - 1, dia);

  const existe =
    comprobacion.getUTCFullYear() === anio &&
    comprobacion.getUTCMonth() === mes - 1 &&
    comprobacion.getUTCDate() === dia;

  if (!existe) {
    throw new Error(
      `Fecha de registro inválida: "${fecha}" no existe en el calendario.`
    );
  }
}

/**
 * Devuelve el día calendario argentino del instante recibido, en formato "YYYY-MM-DD".
 * El parámetro `ahora` es inyectable para poder probar el cálculo sin depender del reloj.
 *
 * @param {Date} [ahora=new Date()] - Instante a convertir
 * @returns {string} Día calendario en America/Argentina/Buenos_Aires, "YYYY-MM-DD"
 * @throws {Error} Si `ahora` no es una fecha válida
 */
function fechaDeRegistroHoy(ahora = new Date()) {
  if (!(ahora instanceof Date) || Number.isNaN(ahora.getTime())) {
    throw new Error(
      "Fecha de registro inválida: el instante recibido no es una fecha válida."
    );
  }

  const partes = {};
  for (const { type, value } of formateadorDiaArgentino.formatToParts(ahora)) {
    partes[type] = value;
  }

  return `${partes.year.padStart(4, "0")}-${partes.month}-${partes.day}`;
}

/**
 * Describe el tipo de dato recibido para incluirlo en el mensaje de error.
 *
 * @param {any} valor - Valor a describir
 * @returns {string} Descripción legible del tipo
 */
function tipoDeDato(valor) {
  if (valor === null) {
    return "null";
  }
  if (Array.isArray(valor)) {
    return "un arreglo";
  }
  return `un valor de tipo ${typeof valor}`;
}

module.exports = {
  validarFechaRegistro,
  fechaDeRegistroHoy,
};
