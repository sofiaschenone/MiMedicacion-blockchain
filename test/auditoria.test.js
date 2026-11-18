const { expect } = require("chai");

const {
  auditarIntegridadRegistro,
  diagnosticar,
  esRegistroNoEncontrado,
  generarHashDiario,
  ESTADO_INTEGRO,
  ESTADO_ALTERADO,
  ESTADO_NO_ANCLADO,
  ESTADO_NO_AUDITABLE,
  DIAGNOSTICO_INTEGRO,
  DIAGNOSTICO_ALTERADO,
  DIAGNOSTICO_NO_ANCLADO,
  DIAGNOSTICO_NO_AUDITABLE,
} = require("../src/blockchainService");

/**
 * La auditoría no es la verificación: verificar responde un booleano, auditar
 * decide qué significa ese booleano. Un `false` del contrato puede querer decir
 * "el hash no coincide" o "el registro nunca se ancló", y acusar de fraude en el
 * segundo caso es una acusación falsa.
 *
 * Por eso el diagnóstico vive en una función pura, sin red ni credenciales:
 * recibe existencia y coincidencia, y devuelve uno de tres estados.
 */
describe("Auditoría: diagnóstico de tres estados", function () {
  it("reporta INTEGRO cuando el registro existe y el hash coincide", function () {
    const resultado = diagnosticar(true, true);

    expect(resultado.estado).to.equal(ESTADO_INTEGRO);
    expect(resultado.diagnostico).to.equal(DIAGNOSTICO_INTEGRO);
  });

  it("reporta ALTERADO cuando el registro existe y el hash no coincide", function () {
    const resultado = diagnosticar(true, false);

    expect(resultado.estado).to.equal(ESTADO_ALTERADO);
    expect(resultado.diagnostico).to.equal(DIAGNOSTICO_ALTERADO);
    expect(resultado.diagnostico).to.match(/alteración o fraude/i);
  });

  it("reporta NO_ANCLADO cuando el registro no existe", function () {
    const resultado = diagnosticar(false, false);

    expect(resultado.estado).to.equal(ESTADO_NO_ANCLADO);
  });

  it("el diagnóstico de NO_ANCLADO aclara que no hubo alteración ni fraude", function () {
    const { diagnostico } = diagnosticar(false, false);

    expect(diagnostico).to.equal(DIAGNOSTICO_NO_ANCLADO);
    expect(diagnostico).to.match(/no está anclado/i);
    expect(diagnostico).to.match(/no es una alteración ni un fraude/i);
    // No debe reutilizar el texto acusatorio del estado ALTERADO.
    expect(diagnostico).to.not.equal(DIAGNOSTICO_ALTERADO);
  });

  it("ignora la coincidencia cuando el registro no existe", function () {
    // Sin anclaje no hay nada que pueda coincidir: el estado ausente manda.
    expect(diagnosticar(false, true).estado).to.equal(ESTADO_NO_ANCLADO);
  });
});

/**
 * El revert RegistroNoEncontrado(string,string) puede llegar de formas distintas
 * según cómo lo envuelva ethers o el proveedor RPC. El helper debe reconocerlo
 * por el texto del error y por el selector de los datos, sin asumir una sola.
 */
describe("Auditoría: detección del revert RegistroNoEncontrado", function () {
  // Selector de RegistroNoEncontrado(string,string): 0x295ea565
  const DATOS_REVERT =
    "0x295ea565" +
    "0000000000000000000000000000000000000000000000000000000000000040" +
    "0000000000000000000000000000000000000000000000000000000000000080" +
    "0000000000000000000000000000000000000000000000000000000000000005" +
    "5041435f58" +
    "000000000000000000000000000000000000000000000000000000000000000a" +
    "323032362d31312d3134";

  it("reconoce el error por el mensaje que nombra el custom error", function () {
    const error = new Error(
      "VM Exception while processing transaction: reverted with custom error " +
        "'RegistroNoEncontrado(\"PAC_X\", \"2026-11-14\")'"
    );

    expect(esRegistroNoEncontrado(error)).to.be.true;
  });

  it("reconoce el error por los datos crudos del revert", function () {
    const error = { code: "CALL_EXCEPTION", data: DATOS_REVERT };

    expect(esRegistroNoEncontrado(error)).to.be.true;
  });

  it("reconoce el error por el reason decodificado por ethers", function () {
    const error = {
      reason: 'RegistroNoEncontrado("PAC_X", "2026-11-14")',
      message: "execution reverted",
    };

    expect(esRegistroNoEncontrado(error)).to.be.true;
  });

  it("no confunde un error irrelevante con RegistroNoEncontrado", function () {
    expect(
      esRegistroNoEncontrado(new Error("execution reverted: OwnableUnauthorizedAccount"))
    ).to.be.false;
    expect(esRegistroNoEncontrado({ code: "NETWORK_ERROR", message: "timeout" })).to.be.false;
    expect(esRegistroNoEncontrado(null)).to.be.false;
    expect(esRegistroNoEncontrado(undefined)).to.be.false;
  });

  it("no confunde otro custom error del contrato con RegistroNoEncontrado", function () {
    // Selector de RegistroYaExistente(string,string), distinto al buscado.
    const datosDeOtroError = "0x926151ca0000000000000000000000000000000000000000000000000000000000000040";

    expect(esRegistroNoEncontrado({ data: datosDeOtroError })).to.be.false;
  });
});

/**
 * La auditoría completa se prueba con un doble de `consultarHash`: así se cubre
 * el cableado de punta a punta (cálculo del hash, consulta del anclaje y mapeo al
 * estado) sin red ni credenciales. El seam mantiene la llamada de un solo
 * argumento para el código de producción.
 */
describe("Auditoría: integración de los cuatro estados", function () {
  function datosDePrueba(fecha = "2026-11-13") {
    return {
      paciente: "PAC_001",
      fecha,
      tomas: [{ medicamento: "Enalapril 10mg", hora: "08:00", estado: "TOMADO" }],
    };
  }

  it("reporta INTEGRO cuando el hash local coincide con el anclado", async function () {
    const datosActuales = datosDePrueba();
    const hashLocal = generarHashDiario(datosActuales);

    const resultado = await auditarIntegridadRegistro(datosActuales, {
      consultarHash: async () => ({
        hashRegistro: hashLocal,
        timestamp: 0,
        fechaLegible: "",
      }),
    });

    expect(resultado.estado).to.equal(ESTADO_INTEGRO);
    expect(resultado.diagnostico).to.equal(DIAGNOSTICO_INTEGRO);
    expect(resultado.hashCalculado).to.equal(hashLocal);
    expect(resultado.esIntegro).to.be.true;
  });

  it("reporta ALTERADO cuando el hash local discrepa del anclado", async function () {
    const datosActuales = datosDePrueba();

    const resultado = await auditarIntegridadRegistro(datosActuales, {
      consultarHash: async () => ({
        hashRegistro: `0x${"00".repeat(32)}`,
        timestamp: 0,
        fechaLegible: "",
      }),
    });

    expect(resultado.estado).to.equal(ESTADO_ALTERADO);
    expect(resultado.diagnostico).to.equal(DIAGNOSTICO_ALTERADO);
    expect(resultado.esIntegro).to.be.false;
  });

  it("reporta NO_ANCLADO cuando el contrato revierte con RegistroNoEncontrado", async function () {
    const datosActuales = datosDePrueba();

    const resultado = await auditarIntegridadRegistro(datosActuales, {
      consultarHash: async () => {
        throw new Error(
          'VM Exception while processing transaction: reverted with custom error ' +
            "'RegistroNoEncontrado(\"PAC_001\", \"2026-11-13\")'"
        );
      },
    });

    expect(resultado.estado).to.equal(ESTADO_NO_ANCLADO);
    expect(resultado.diagnostico).to.equal(DIAGNOSTICO_NO_ANCLADO);
    expect(resultado.hashCalculado).to.equal(generarHashDiario(datosActuales));
    expect(resultado.esIntegro).to.be.false;
  });

  it("reporta NO_AUDITABLE cuando la fecha local no es una fecha de registro válida", async function () {
    // "2026-02-31" pudo haberse anclado antes de la validación de fecha.
    const datosActuales = datosDePrueba("2026-02-31");
    let seConsultoLaRed = false;

    const resultado = await auditarIntegridadRegistro(datosActuales, {
      consultarHash: async () => {
        seConsultoLaRed = true;
        throw new Error("No debería consultarse la blockchain con una fecha inválida.");
      },
    });

    expect(seConsultoLaRed).to.be.false;
    expect(resultado.estado).to.equal(ESTADO_NO_AUDITABLE);
    expect(resultado.diagnostico).to.equal(DIAGNOSTICO_NO_AUDITABLE);
    expect(resultado.hashCalculado).to.be.null;
    expect(resultado.esIntegro).to.be.false;
  });

  it("conserva la llamada con un solo argumento", async function () {
    expect(auditarIntegridadRegistro.length).to.equal(1);

    // Una fecha inválida no toca la red, así que la forma de un solo argumento
    // se puede ejercitar sin credenciales.
    const resultado = await auditarIntegridadRegistro(datosDePrueba("2026-02-31"));

    expect(resultado.estado).to.equal(ESTADO_NO_AUDITABLE);
  });
});
