const { expect } = require("chai");

const {
  resumirLote,
  ESTADO_SIN_REGISTROS,
  ESTADO_EXITO,
  ESTADO_PARCIAL,
  ESTADO_NINGUNO,
} = require("../src/resumen");

/**
 * El cierre del proceso diario tiene que describir lo que pasó, no lo que se
 * quiso hacer. Estos tests fijan esa diferencia: un lote con fallidos no puede
 * cerrar con una fórmula optimista, y un lote vacío no puede presentarse como
 * si algo se hubiera procesado.
 */

function exito(paciente) {
  return { paciente, exito: true, motivo: null };
}

function fallo(paciente, motivo) {
  return { paciente, exito: false, motivo };
}

// Fórmulas que sólo son ciertas cuando todos los registros se anclaron. Si
// reaparecen en un cierre parcial o fallido, el operador vuelve a leer una
// mentira y el test lo delata.
const FORMULAS_OPTIMISTAS = [
  /todos/i,
  /éxito total/i,
  /todo salió bien/i,
  /lote completo/i,
];

function expectSinFormulaOptimista(encabezado) {
  FORMULAS_OPTIMISTAS.forEach((formula) => {
    expect(encabezado, `"${encabezado}" no debería afirmar ${formula}`).to.not.match(
      formula
    );
  });
}

// El encabezado informa las tres cifras con su etiqueta: no alcanza con que
// los números aparezcan sueltos en el texto.
function expectCifras(encabezado, { procesados, exitosos, fallidos }) {
  expect(encabezado).to.include(`procesados: ${procesados}`);
  expect(encabezado).to.include(`exitosos: ${exitosos}`);
  expect(encabezado).to.include(`fallidos: ${fallidos}`);
}

describe("Resumen fiel del lote diario", function () {
  it("con el lote vacío informa SIN_REGISTROS y no dice que procesó algo", function () {
    const resumen = resumirLote([]);

    expect(resumen.estado).to.equal(ESTADO_SIN_REGISTROS);
    expect(resumen.procesados).to.equal(0);
    expect(resumen.exitosos).to.equal(0);
    expect(resumen.fallidos).to.equal(0);
    expectCifras(resumen.encabezado, {
      procesados: 0,
      exitosos: 0,
      fallidos: 0,
    });

    expect(resumen.encabezado).to.match(/no había registros/i);
    expect(resumen.encabezado).to.not.match(/se procesaron|fueron procesados|anclad/i);
    expectSinFormulaOptimista(resumen.encabezado);
  });

  it("con todos los registros exitosos informa EXITO", function () {
    const resumen = resumirLote([exito("PAC_001"), exito("PAC_002")]);

    expect(resumen.estado).to.equal(ESTADO_EXITO);
    expect(resumen.procesados).to.equal(2);
    expect(resumen.exitosos).to.equal(2);
    expect(resumen.fallidos).to.equal(0);
    expectCifras(resumen.encabezado, {
      procesados: 2,
      exitosos: 2,
      fallidos: 0,
    });

    expect(resumen.encabezado).to.match(/éxito/i);
  });

  it("con algunos fallidos informa PARCIAL y no afirma que todo salió bien", function () {
    const resumen = resumirLote([
      exito("PAC_001"),
      fallo("PAC_002", "Conflicto de inmutabilidad: el registro ya ha sido anclado."),
    ]);

    expect(resumen.estado).to.equal(ESTADO_PARCIAL);
    expect(resumen.procesados).to.equal(2);
    expect(resumen.exitosos).to.equal(1);
    expect(resumen.fallidos).to.equal(1);
    expectCifras(resumen.encabezado, {
      procesados: 2,
      exitosos: 1,
      fallidos: 1,
    });

    expect(resumen.encabezado).to.match(/parcial/i);
    expectSinFormulaOptimista(resumen.encabezado);
  });

  it("con todos fallidos informa NINGUNO y no celebra el cierre", function () {
    const resumen = resumirLote([
      fallo("PAC_001", "Conflicto de inmutabilidad: el registro ya ha sido anclado."),
      fallo("PAC_002", "Conflicto de inmutabilidad: el registro ya ha sido anclado."),
    ]);

    expect(resumen.estado).to.equal(ESTADO_NINGUNO);
    expect(resumen.procesados).to.equal(2);
    expect(resumen.exitosos).to.equal(0);
    expect(resumen.fallidos).to.equal(2);
    expectCifras(resumen.encabezado, {
      procesados: 2,
      exitosos: 0,
      fallidos: 2,
    });

    expect(resumen.encabezado).to.match(/no se ancló ningún registro/i);
    expect(resumen.encabezado).to.not.match(/🎉/);
    expect(resumen.encabezado).to.not.match(/éxito/i);
    expectSinFormulaOptimista(resumen.encabezado);
  });

  it("los cuatro estados producen encabezados cualitativamente distintos", function () {
    const encabezados = [
      resumirLote([]).encabezado,
      resumirLote([exito("PAC_001")]).encabezado,
      resumirLote([exito("PAC_001"), fallo("PAC_002", "sin red")]).encabezado,
      resumirLote([fallo("PAC_001", "sin red")]).encabezado,
    ];

    expect(new Set(encabezados).size).to.equal(4);
  });

  it("cada paciente procesado cuenta exactamente una vez", function () {
    const resumen = resumirLote([
      exito("PAC_001"),
      fallo("PAC_002", "sin red"),
      exito("PAC_003"),
      fallo("PAC_004", "sin red"),
      fallo("PAC_005", "sin red"),
    ]);

    expect(resumen.procesados).to.equal(5);
    expect(resumen.exitosos).to.equal(2);
    expect(resumen.fallidos).to.equal(3);
    expect(resumen.exitosos + resumen.fallidos).to.equal(resumen.procesados);
    expect(resumen.estado).to.equal(ESTADO_PARCIAL);
  });

  it("clasifica el estado por el resultado, no por la cantidad", function () {
    expect(resumirLote([exito("PAC_001")]).estado).to.equal(ESTADO_EXITO);
    expect(resumirLote([fallo("PAC_001", "sin red")]).estado).to.equal(
      ESTADO_NINGUNO
    );
    expect(
      resumirLote([exito("PAC_001"), fallo("PAC_002", "sin red")]).estado
    ).to.equal(ESTADO_PARCIAL);
  });
});
