const { expect } = require("chai");

const { ejecutarAnclajeDiario } = require("../src/cron");
const { CODIGO_YA_ANCLADO, CODIGO_ERROR_DE_ANCLAJE } = require("../src/blockchainService");
const { fechaDeRegistroHoy } = require("../src/validacion");
const {
  ESTADO_EXITO,
  ESTADO_PARCIAL,
  ESTADO_TODOS_FALLIDOS,
  ESTADO_SIN_CAMBIOS,
} = require("../src/resumen");

/**
 * El cableado del cierre tiene que usar la clasificación del resultado, no un
 * mensaje fijo. Estos tests llaman al proceso completo con la fuente de registros
 * y el anclaje inyectados, sin red ni credenciales, y verifican lo que el
 * operador ve en la salida. Si alguien vuelve a imprimir un "todos procesados"
 * incondicional, el encabezado y las cifras dejan de coincidir y el test falla.
 */

const MENSAJE_DE_CONFLICTO =
  "Conflicto de inmutabilidad: El registro ya ha sido anclado previamente.";

function registros(...pacientes) {
  const fecha = fechaDeRegistroHoy();
  return pacientes.map((paciente) => ({
    paciente,
    nombrePaciente: `Paciente ${paciente}`,
    fecha,
    tomas: [],
  }));
}

function reciboDeAnclaje() {
  return {
    transactionHash: `0x${"cd".repeat(32)}`,
    blockNumber: 123,
    explorerUrl: "https://sepolia.etherscan.io/tx/0xcd",
  };
}

function errorConCodigo(codigo, mensaje) {
  const error = new Error(mensaje);
  error.codigo = codigo;
  return error;
}

/**
 * Ejecuta el proceso capturando la salida del operador. Los logs se restauran
 * aunque la ejecución lance, para no contaminar los tests siguientes.
 */
async function ejecutarCapturando(opciones) {
  const lineas = [];
  const logOriginal = console.log;
  const errorOriginal = console.error;

  console.log = (...args) => lineas.push(args.map(String).join(" "));
  console.error = (...args) => lineas.push(args.map(String).join(" "));

  try {
    const resumen = await ejecutarAnclajeDiario(opciones);
    return { resumen, texto: lineas.join("\n") };
  } finally {
    console.log = logOriginal;
    console.error = errorOriginal;
  }
}

describe("Cableado del cierre diario", function () {
  it("con todos los registros anclados informa EXITO y lo imprime", async function () {
    const { resumen, texto } = await ejecutarCapturando({
      obtenerRegistros: () => registros("PAC_001", "PAC_002"),
      anclarRegistro: async () => reciboDeAnclaje(),
    });

    expect(resumen.estado).to.equal(ESTADO_EXITO);
    expect(resumen.procesados).to.equal(2);
    expect(resumen.anclados).to.equal(2);
    expect(resumen.yaAnclados).to.equal(0);
    expect(resumen.fallidos).to.equal(0);

    expect(texto).to.include(resumen.encabezado);
    expect(texto).to.include("procesados: 2");
    expect(texto).to.include("anclados: 2");
    expect(texto).to.include("yaAnclados: 0");
    expect(texto).to.include("fallidos: 0");
  });

  it("con un anclaje y un fallo informa PARCIAL y no reutiliza el cierre de éxito", async function () {
    let llamadas = 0;

    const { resumen, texto } = await ejecutarCapturando({
      obtenerRegistros: () => registros("PAC_001", "PAC_002"),
      anclarRegistro: async () => {
        llamadas += 1;
        if (llamadas === 2) {
          throw errorConCodigo(
            CODIGO_ERROR_DE_ANCLAJE,
            "No se pudo anclar el registro: sin red."
          );
        }
        return reciboDeAnclaje();
      },
    });

    expect(resumen.estado).to.equal(ESTADO_PARCIAL);
    expect(resumen.procesados).to.equal(2);
    expect(resumen.anclados).to.equal(1);
    expect(resumen.yaAnclados).to.equal(0);
    expect(resumen.fallidos).to.equal(1);

    expect(texto).to.include(resumen.encabezado);
    expect(texto).to.include("anclados: 1");
    expect(texto).to.include("fallidos: 1");
  });

  it("con todos los registros fallidos informa TODOS_FALLIDOS y no celebra", async function () {
    const { resumen, texto } = await ejecutarCapturando({
      obtenerRegistros: () => registros("PAC_001", "PAC_002"),
      anclarRegistro: async () => {
        throw errorConCodigo(
          CODIGO_ERROR_DE_ANCLAJE,
          "No se pudo anclar el registro: sin red."
        );
      },
    });

    expect(resumen.estado).to.equal(ESTADO_TODOS_FALLIDOS);
    expect(resumen.procesados).to.equal(2);
    expect(resumen.anclados).to.equal(0);
    expect(resumen.yaAnclados).to.equal(0);
    expect(resumen.fallidos).to.equal(2);

    expect(texto).to.include(resumen.encabezado);
    expect(texto).to.include("fallidos: 2");
    expect(texto).to.not.match(/🎉/);
  });

  it("con todos los registros ya anclados informa SIN_CAMBIOS, no un fallo", async function () {
    const { resumen, texto } = await ejecutarCapturando({
      obtenerRegistros: () => registros("PAC_001", "PAC_002"),
      anclarRegistro: async () => {
        throw errorConCodigo(CODIGO_YA_ANCLADO, MENSAJE_DE_CONFLICTO);
      },
    });

    expect(resumen.estado).to.equal(ESTADO_SIN_CAMBIOS);
    expect(resumen.procesados).to.equal(2);
    expect(resumen.anclados).to.equal(0);
    expect(resumen.yaAnclados).to.equal(2);
    expect(resumen.fallidos).to.equal(0);

    expect(texto).to.include(resumen.encabezado);
    expect(texto).to.include("yaAnclados: 2");
    expect(texto).to.include("fallidos: 0");
    expect(texto).to.match(/sin cambios/i);
    expect(texto).to.match(/ya estaban anclados/i);
    expect(texto).to.not.match(/no se ancló ningún registro/i);
    expect(texto).to.not.match(/🎉/);
  });
});
