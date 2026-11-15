const { expect } = require("chai");

const {
  diagnosticar,
  esRegistroNoEncontrado,
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

    expect(resultado.estado).to.equal("INTEGRO");
    expect(resultado.diagnostico).to.match(/integridad confirmada/i);
  });

  it("reporta ALTERADO cuando el registro existe y el hash no coincide", function () {
    const resultado = diagnosticar(true, false);

    expect(resultado.estado).to.equal("ALTERADO");
    expect(resultado.diagnostico).to.match(/alerta de seguridad/i);
    expect(resultado.diagnostico).to.match(/alteración o fraude/i);
  });

  it("reporta NO_ANCLADO cuando el registro no existe", function () {
    const resultado = diagnosticar(false, false);

    expect(resultado.estado).to.equal("NO_ANCLADO");
  });

  it("el diagnóstico de NO_ANCLADO aclara que no hubo alteración ni fraude", function () {
    const { diagnostico } = diagnosticar(false, false);

    expect(diagnostico).to.match(/no está anclado/i);
    expect(diagnostico).to.match(/no es una alteración ni un fraude/i);
    // No debe reutilizar el texto acusatorio del estado ALTERADO.
    expect(diagnostico).to.not.match(/alerta de seguridad/i);
  });

  it("ignora la coincidencia cuando el registro no existe", function () {
    // Sin anclaje no hay nada que pueda coincidir: el estado ausente manda.
    expect(diagnosticar(false, true).estado).to.equal("NO_ANCLADO");
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
