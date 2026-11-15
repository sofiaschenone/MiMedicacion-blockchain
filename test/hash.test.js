const { expect } = require("chai");
const { generarHashDiario } = require("../src/blockchainService");

/**
 * Estas pruebas fijan el comportamiento de la canonicalización previa al hasheo.
 *
 * El hash diario es lo que se ancla en el contrato: si la forma de normalizar cambia,
 * los registros ya anclados dejan de verificar y las auditorías fallan en silencio.
 * Por eso el último caso congela un hash concreto.
 */
describe("Hash diario: canonicalización determinista", function () {
  // Registro de referencia: la fecha es una fecha real del calendario.
  const registroBase = {
    paciente: "PAC_001",
    fecha: "2026-11-13",
    tomas: [
      { medicamento: "Enalapril 10mg", hora: "08:00", estado: "TOMADO" },
      { medicamento: "Atorvastatina 20mg", hora: "21:00", estado: "TOMADO" },
    ],
  };

  it("produce el mismo hash para el mismo registro con propiedades en distinto orden", function () {
    // Mismas propiedades y valores, declaradas en orden inverso.
    const registroReordenado = {
      tomas: registroBase.tomas,
      fecha: registroBase.fecha,
      paciente: registroBase.paciente,
    };

    expect(generarHashDiario(registroReordenado)).to.equal(
      generarHashDiario(registroBase)
    );
  });

  it("produce el mismo hash cuando el reordenamiento ocurre en objetos anidados", function () {
    const registroAnidado = {
      paciente: "PAC_001",
      fecha: "2026-11-13",
      tomas: [
        { medicamento: "Enalapril 10mg", hora: "08:00", estado: "TOMADO" },
        { medicamento: "Atorvastatina 20mg", hora: "21:00", estado: "TOMADO" },
      ],
    };

    // Mismo contenido, pero cada toma tiene sus propiedades en otro orden.
    const registroAnidadoReordenado = {
      paciente: "PAC_001",
      fecha: "2026-11-13",
      tomas: [
        { estado: "TOMADO", hora: "08:00", medicamento: "Enalapril 10mg" },
        { hora: "21:00", estado: "TOMADO", medicamento: "Atorvastatina 20mg" },
      ],
    };

    expect(generarHashDiario(registroAnidadoReordenado)).to.equal(
      generarHashDiario(registroAnidado)
    );
  });

  it("distingue dos registros cuyos arrays tienen los elementos permutados", function () {
    // Contraste del caso anterior: el reordenamiento de propiedades no debe
    // extenderse a los arrays, porque el orden de las tomas es parte del contenido.
    const primerOrden = {
      paciente: "PAC_001",
      fecha: "2026-11-13",
      tomas: [
        { medicamento: "Enalapril 10mg", hora: "08:00", estado: "TOMADO" },
        { medicamento: "Atorvastatina 20mg", hora: "21:00", estado: "TOMADO" },
      ],
    };

    const segundoOrden = {
      paciente: "PAC_001",
      fecha: "2026-11-13",
      tomas: [
        { medicamento: "Atorvastatina 20mg", hora: "21:00", estado: "TOMADO" },
        { medicamento: "Enalapril 10mg", hora: "08:00", estado: "TOMADO" },
      ],
    };

    expect(generarHashDiario(segundoOrden)).to.not.equal(
      generarHashDiario(primerOrden)
    );
  });

  it("preserva los valores null sin alterar el hash", function () {
    const registroConNulos = {
      paciente: "PAC_001",
      fecha: "2026-11-13",
      tomas: [{ medicamento: "Enalapril 10mg", hora: "08:00", estado: null }],
      observaciones: null,
    };

    // El mismo registro con las propiedades en otro orden da el mismo hash.
    const registroConNulosReordenado = {
      observaciones: null,
      tomas: [{ estado: null, hora: "08:00", medicamento: "Enalapril 10mg" }],
      fecha: "2026-11-13",
      paciente: "PAC_001",
    };

    expect(generarHashDiario(registroConNulosReordenado)).to.equal(
      generarHashDiario(registroConNulos)
    );

    // Y el null viaja en el JSON: reemplazarlo por otro valor cambia el hash,
    // señal de que no se descarta durante la normalización.
    const registroSinNulo = {
      paciente: "PAC_001",
      fecha: "2026-11-13",
      tomas: [{ medicamento: "Enalapril 10mg", hora: "08:00", estado: "TOMADO" }],
      observaciones: null,
    };

    expect(generarHashDiario(registroSinNulo)).to.not.equal(
      generarHashDiario(registroConNulos)
    );
  });

  it("lanza un error explícito cuando la entrada no es un objeto", function () {
    expect(() => generarHashDiario("2026-11-13")).to.throw(
      "El argumento 'datosTomas' debe ser un objeto JSON válido."
    );
    expect(() => generarHashDiario(null)).to.throw(
      "El argumento 'datosTomas' debe ser un objeto JSON válido."
    );
    expect(() => generarHashDiario(undefined)).to.throw(
      "El argumento 'datosTomas' debe ser un objeto JSON válido."
    );
  });

  it("mantiene un hash fijo conocido para el registro de referencia", function () {
    // Vector congelado a propósito: fija la canonicalización completa (orden de
    // propiedades, tratamiento de arrays y codificación UTF-8). Si este valor
    // cambia, los registros ya anclados dejarían de verificar; el esquema de
    // hasheo debe versionarse en lugar de actualizar el número.
    expect(generarHashDiario(registroBase)).to.equal(
      "0xf3f23e4d7a6c0f64a6bcb1555b8c8468fbd3b8b9cfa9cb7fb78747be69abaf32"
    );
  });
});
