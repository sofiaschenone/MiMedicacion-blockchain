const { expect } = require("chai");
const { ethers } = require("ethers");

const {
  clasificarRevertDelContrato,
  esRegistroNoEncontrado,
  guardarHashEnBlockchain,
  ERRORES_DEL_CONTRATO,
  CODIGO_YA_ANCLADO,
  CODIGO_IDENTIFICADOR_VACIO,
  CODIGO_FECHA_VACIA,
  CODIGO_HASH_INVALIDO,
  CODIGO_ERROR_DE_CONFIGURACION,
  CODIGO_ERROR_DE_ANCLAJE,
} = require("../src/blockchainService");

/**
 * Los custom errors se toman de la tabla que exporta el servicio: el test no
 * mantiene una copia de las firmas que pueda quedar desactualizada.
 */
const NOMBRES_DE_ERROR = ERRORES_DEL_CONTRATO.map(({ nombre }) => nombre);

// Mismo criterio que el servicio: el selector se deriva de la firma, sin
// escribir valores hexadecimales a mano.
function selectorDe(nombre) {
  const { firma } = ERRORES_DEL_CONTRATO.find((error) => error.nombre === nombre);
  return ethers.id(firma).slice(0, 10).toLowerCase();
}

function datosDeRevert(nombre) {
  return `${selectorDe(nombre)}${"00".repeat(64)}`;
}

const CONFLICTO_DE_INMUTABILIDAD = /inmutabilidad|ya ha sido anclado/i;

/**
 * Un revert del contrato no siempre llega con el mismo aspecto: algunos nodos
 * incluyen el nombre del custom error en el mensaje, otros sólo entregan el
 * `data` crudo con el selector. La clasificación tiene que reconocer los cinco
 * errors del contrato en todas esas formas, y devolver `null` cuando el error
 * no proviene del contrato (red, credenciales, etc.).
 */
describe("Clasificación de reverts del contrato", function () {
  it("reconoce los cinco custom errors por el selector de los datos crudos", function () {
    NOMBRES_DE_ERROR.forEach((nombre) => {
      const error = { code: "CALL_EXCEPTION", data: datosDeRevert(nombre) };
      expect(clasificarRevertDelContrato(error), nombre).to.equal(nombre);
    });
  });

  it("reconoce los cinco custom errors por el nombre en el mensaje", function () {
    NOMBRES_DE_ERROR.forEach((nombre) => {
      const { firma } = ERRORES_DEL_CONTRATO.find((error) => error.nombre === nombre);
      const error = new Error(
        "VM Exception while processing transaction: reverted with custom error " +
          `'${firma}'`
      );
      expect(clasificarRevertDelContrato(error), nombre).to.equal(nombre);
    });
  });

  it("reconoce los cinco custom errors por el reason decodificado por ethers", function () {
    NOMBRES_DE_ERROR.forEach((nombre) => {
      const { firma } = ERRORES_DEL_CONTRATO.find((error) => error.nombre === nombre);
      const error = { reason: firma, message: "execution reverted" };
      expect(clasificarRevertDelContrato(error), nombre).to.equal(nombre);
    });
  });

  it("reconoce un custom error cuando ethers sólo entrega el data y 'unknown custom error'", function () {
    // Es la forma observada contra Sepolia: el mensaje no trae el nombre, sólo
    // el selector en los datos crudos del revert.
    const error = {
      code: "CALL_EXCEPTION",
      message: "execution reverted (unknown custom error)",
      data: datosDeRevert("HashInvalido"),
    };

    expect(clasificarRevertDelContrato(error)).to.equal("HashInvalido");
  });

  it("devuelve null para un error de red, sin datos de revert", function () {
    const error = {
      code: "NETWORK_ERROR",
      message: "could not detect network (event=\"noNetwork\", code=NETWORK_ERROR)",
    };

    expect(clasificarRevertDelContrato(error)).to.be.null;
  });

  it("devuelve null para null, undefined y valores sin información del contrato", function () {
    expect(clasificarRevertDelContrato(null)).to.be.null;
    expect(clasificarRevertDelContrato(undefined)).to.be.null;
    expect(clasificarRevertDelContrato("timeout")).to.be.null;
    expect(clasificarRevertDelContrato({ code: "INSUFFICIENT_FUNDS" })).to.be.null;
  });

  it("devuelve null para un selector desconocido", function () {
    expect(
      clasificarRevertDelContrato({ data: `0xdeadbeef${"00".repeat(64)}` })
    ).to.be.null;
  });

  it("esRegistroNoEncontrado sigue delegando en el clasificador", function () {
    // Las tres formas del revert están cubiertas en auditoria.test.js; acá sólo
    // se verifica que el wrapper siga siendo el mismo predicado.
    const error = { data: datosDeRevert("RegistroNoEncontrado") };
    expect(esRegistroNoEncontrado(error)).to.equal(
      clasificarRevertDelContrato(error) === "RegistroNoEncontrado"
    );
  });
});

/**
 * `guardarHashEnBlockchain` recibe la dependencia que arma el contrato como
 * seam opcional: así el catch se ejercita con un doble que revierte, sin red
 * ni credenciales. Es el mismo patrón que usa `auditarIntegridadRegistro` con
 * `consultarHash`.
 */
describe("guardarHashEnBlockchain: cada revert se reporta por su causa", function () {
  const FECHA = "2026-11-15";
  const HASH = `0x${"ab".repeat(32)}`;

  function contratoQueRevierte(error) {
    return {
      registrarHash: async () => {
        throw error;
      },
    };
  }

  async function anclarConError(
    error,
    { pacienteId = "PAC_001", fecha = FECHA, hash = HASH } = {}
  ) {
    try {
      await guardarHashEnBlockchain(pacienteId, fecha, hash, {
        obtenerContrato: () => contratoQueRevierte(error),
      });
    } catch (capturado) {
      return capturado;
    }
    throw new Error("Se esperaba que guardarHashEnBlockchain lanzara un error.");
  }

  it("reporta conflicto de inmutabilidad sólo para RegistroYaExistente", async function () {
    const error = await anclarConError({
      code: "CALL_EXCEPTION",
      data: datosDeRevert("RegistroYaExistente"),
    });

    expect(error.message).to.match(/conflicto de inmutabilidad/i);
    expect(error.message).to.match(/ya ha sido anclado previamente/i);
    expect(error.message).to.include("PAC_001");
    expect(error.message).to.include(FECHA);
    expect(error.codigo).to.equal(CODIGO_YA_ANCLADO);
  });

  it("nombra el identificador vacío en lugar de la inmutabilidad", async function () {
    const error = await anclarConError(
      { code: "CALL_EXCEPTION", data: datosDeRevert("IdentificadorVacio") },
      { pacienteId: "" }
    );

    expect(error.message).to.match(/identificador de paciente inválido/i);
    expect(error.message).to.match(/vacío/i);
    expect(error.message).to.not.match(CONFLICTO_DE_INMUTABILIDAD);
    expect(error.codigo).to.equal(CODIGO_IDENTIFICADOR_VACIO);
  });

  it("nombra la fecha vacía en lugar de la inmutabilidad", async function () {
    const error = await anclarConError({
      code: "CALL_EXCEPTION",
      data: datosDeRevert("FechaVacia"),
    });

    expect(error.message).to.match(/fecha de registro inválida/i);
    expect(error.message).to.match(/vacía/i);
    expect(error.message).to.not.match(CONFLICTO_DE_INMUTABILIDAD);
    expect(error.codigo).to.equal(CODIGO_FECHA_VACIA);
  });

  it("nombra el hash nulo en lugar de la inmutabilidad", async function () {
    const error = await anclarConError(
      { code: "CALL_EXCEPTION", data: datosDeRevert("HashInvalido") },
      { hash: `0x${"00".repeat(32)}` }
    );

    expect(error.message).to.match(/hash inválido/i);
    expect(error.message).to.match(/nulo/i);
    expect(error.message).to.not.match(CONFLICTO_DE_INMUTABILIDAD);
    expect(error.codigo).to.equal(CODIGO_HASH_INVALIDO);
  });

  it("no traduce RegistroNoEncontrado como si fuera un error de anclaje", async function () {
    const error = await anclarConError({
      code: "CALL_EXCEPTION",
      data: datosDeRevert("RegistroNoEncontrado"),
    });

    expect(error.message).to.match(/no se pudo anclar el registro/i);
    expect(error.message).to.not.match(CONFLICTO_DE_INMUTABILIDAD);
    expect(error.codigo).to.equal(CODIGO_ERROR_DE_ANCLAJE);
  });

  it("reconoce el revert sólo por el data, como lo entrega Sepolia", async function () {
    const error = await anclarConError({
      code: "CALL_EXCEPTION",
      message: "execution reverted (unknown custom error)",
      data: datosDeRevert("HashInvalido"),
    });

    expect(error.message).to.match(/hash inválido/i);
    expect(error.message).to.not.match(CONFLICTO_DE_INMUTABILIDAD);
  });

  it("conserva el error original como cause en toda causa traducida", async function () {
    const original = {
      code: "CALL_EXCEPTION",
      data: datosDeRevert("IdentificadorVacio"),
    };

    const error = await anclarConError(original, { pacienteId: "" });

    expect(error.cause).to.equal(original);
  });

  it("envuelve con contexto un error de red y no afirma nada sobre inmutabilidad", async function () {
    const original = {
      code: "NETWORK_ERROR",
      message: "could not detect network (event=\"noNetwork\")",
    };

    const error = await anclarConError(original);

    expect(error.message).to.match(/no se pudo anclar el registro/i);
    expect(error.message).to.include(original.message);
    expect(error.message).to.not.match(CONFLICTO_DE_INMUTABILIDAD);
    expect(error.cause).to.equal(original);
    expect(error.codigo).to.equal(CODIGO_ERROR_DE_ANCLAJE);
  });

  it("una fecha vacía se rechaza antes de tocar la red y nombra la fecha vacía", async function () {
    let seResolvioElContrato = false;

    let error;
    try {
      await guardarHashEnBlockchain("PAC_001", "", HASH, {
        obtenerContrato: () => {
          seResolvioElContrato = true;
          return contratoQueRevierte(new Error("No debería llegar al contrato."));
        },
      });
    } catch (capturado) {
      error = capturado;
    }

    expect(seResolvioElContrato).to.be.false;
    expect(error.message).to.match(/fecha de registro inválida/i);
    expect(error.message).to.match(/vacía/i);
    expect(error.message).to.not.match(CONFLICTO_DE_INMUTABILIDAD);
    expect(error.cause).to.be.instanceOf(Error);
  });

  describe("forma del hash", function () {
    const HASHES_INVALIDOS = {
      null: null,
      undefined: undefined,
      '"0x"': "0x",
      "de longitud incorrecta": `0x${"ab".repeat(31)}`,
      "con caracteres no hexadecimales": `0x${"zz".repeat(32)}`,
    };

    Object.entries(HASHES_INVALIDOS).forEach(([caso, hash]) => {
      it(`rechaza un hash ${caso} antes de tocar la red`, async function () {
        let seResolvioElContrato = false;

        let error;
        try {
          await guardarHashEnBlockchain("PAC_001", FECHA, hash, {
            obtenerContrato: () => {
              seResolvioElContrato = true;
              return contratoQueRevierte(new Error("No debería llegar al contrato."));
            },
          });
        } catch (capturado) {
          error = capturado;
        }

        expect(seResolvioElContrato).to.be.false;
        expect(error.message).to.match(/hash inválido/i);
        expect(error.message).to.include(FECHA);
        expect(error.message).to.not.match(CONFLICTO_DE_INMUTABILIDAD);
        expect(error.codigo).to.equal(CODIGO_HASH_INVALIDO);
      });
    });
  });

  it("sin PRIVATE_KEY falla por configuración y no por inmutabilidad", async function () {
    const claveOriginal = process.env.PRIVATE_KEY;
    const direccionOriginal = process.env.CONTRACT_ADDRESS;
    delete process.env.PRIVATE_KEY;
    process.env.CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000001";

    try {
      let error;
      try {
        await guardarHashEnBlockchain("PAC_001", FECHA, HASH);
      } catch (capturado) {
        error = capturado;
      }

      expect(error.message).to.match(/configuración inválida/i);
      expect(error.message).to.match(/no se pudo anclar el registro/i);
      expect(error.message).to.not.match(CONFLICTO_DE_INMUTABILIDAD);
      expect(error.codigo).to.equal(CODIGO_ERROR_DE_CONFIGURACION);
    } finally {
      if (claveOriginal === undefined) {
        delete process.env.PRIVATE_KEY;
      } else {
        process.env.PRIVATE_KEY = claveOriginal;
      }
      if (direccionOriginal === undefined) {
        delete process.env.CONTRACT_ADDRESS;
      } else {
        process.env.CONTRACT_ADDRESS = direccionOriginal;
      }
    }
  });

  it("conserva el camino exitoso cuando el contrato acepta el anclaje", async function () {
    const resultado = await guardarHashEnBlockchain("PAC_001", FECHA, HASH, {
      obtenerContrato: () => ({
        registrarHash: async () => ({
          hash: `0x${"cd".repeat(32)}`,
          wait: async () => ({ blockNumber: 123, gasUsed: 21000n }),
        }),
      }),
    });

    expect(resultado.success).to.be.true;
    expect(resultado.blockNumber).to.equal(123);
    expect(resultado.gasUsed).to.equal("21000");
  });
});
