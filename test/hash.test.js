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
  const TOMAS_REFERENCIA = [
    { medicamento: "Enalapril 10mg", hora: "08:00", estado: "TOMADO" },
    { medicamento: "Atorvastatina 20mg", hora: "21:00", estado: "TOMADO" },
  ];

  const ORDEN_BASE = ["paciente", "fecha", "tomas"];
  const ORDEN_TOMA_BASE = ["medicamento", "hora", "estado"];

  // Construye un registro de referencia con las propiedades en el orden indicado.
  // La canonicalización ordena las claves antes de hashear, de modo que el orden
  // de construcción no debe afectar el resultado.
  function fabricarRegistro(ordenPropiedades, opciones = {}) {
    const campos = {
      paciente: "PAC_001",
      fecha: "2026-11-13",
      tomas: opciones.tomas || TOMAS_REFERENCIA,
      ...(opciones.campos || {}),
    };

    const registro = {};
    ordenPropiedades.forEach((clave) => {
      if (clave in campos) {
        registro[clave] = campos[clave];
      }
    });
    return registro;
  }

  // Reordena las propiedades de cada toma para probar el reordenamiento anidado.
  function fabricarTomas(ordenPropiedades, tomasBase = TOMAS_REFERENCIA) {
    return tomasBase.map((toma) => {
      const reordenada = {};
      ordenPropiedades.forEach((clave) => {
        reordenada[clave] = toma[clave];
      });
      return reordenada;
    });
  }

  const registroBase = fabricarRegistro(ORDEN_BASE);

  it("produce el mismo hash para el mismo registro con propiedades en distinto orden", function () {
    // Mismas propiedades y valores, declaradas en orden inverso.
    const registroReordenado = fabricarRegistro(["tomas", "fecha", "paciente"]);

    expect(generarHashDiario(registroReordenado)).to.equal(
      generarHashDiario(registroBase)
    );
  });

  it("produce el mismo hash cuando el reordenamiento ocurre en objetos anidados", function () {
    const registroAnidado = fabricarRegistro(ORDEN_BASE, {
      tomas: fabricarTomas(ORDEN_TOMA_BASE),
    });

    // Mismo contenido, pero cada toma tiene sus propiedades en otro orden.
    const registroAnidadoReordenado = fabricarRegistro(ORDEN_BASE, {
      tomas: fabricarTomas(["estado", "hora", "medicamento"]),
    });

    expect(generarHashDiario(registroAnidadoReordenado)).to.equal(
      generarHashDiario(registroAnidado)
    );
  });

  it("distingue dos registros cuyos arrays tienen los elementos permutados", function () {
    // Contraste del caso anterior: el reordenamiento de propiedades no debe
    // extenderse a los arrays, porque el orden de las tomas es parte del contenido.
    const primerOrden = fabricarRegistro(ORDEN_BASE);
    const segundoOrden = fabricarRegistro(ORDEN_BASE, {
      tomas: [...TOMAS_REFERENCIA].reverse(),
    });

    expect(generarHashDiario(segundoOrden)).to.not.equal(
      generarHashDiario(primerOrden)
    );
  });

  it("preserva los valores null sin alterar el hash", function () {
    const tomasConEstadoNulo = [
      { medicamento: "Enalapril 10mg", hora: "08:00", estado: null },
    ];
    const tomasConEstado = [
      { medicamento: "Enalapril 10mg", hora: "08:00", estado: "TOMADO" },
    ];

    const registroConNulos = fabricarRegistro(
      ["paciente", "fecha", "tomas", "observaciones"],
      { tomas: tomasConEstadoNulo, campos: { observaciones: null } }
    );

    // El mismo registro con las propiedades en otro orden da el mismo hash.
    const registroConNulosReordenado = fabricarRegistro(
      ["observaciones", "tomas", "fecha", "paciente"],
      {
        tomas: fabricarTomas(["estado", "hora", "medicamento"], tomasConEstadoNulo),
        campos: { observaciones: null },
      }
    );

    expect(generarHashDiario(registroConNulosReordenado)).to.equal(
      generarHashDiario(registroConNulos)
    );

    // Y el null viaja en el JSON: reemplazarlo por otro valor cambia el hash,
    // señal de que no se descarta durante la normalización.
    const registroSinNulo = fabricarRegistro(
      ["paciente", "fecha", "tomas", "observaciones"],
      { tomas: tomasConEstado, campos: { observaciones: null } }
    );

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
