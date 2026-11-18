const { expect } = require("chai");

const {
  resumirLote,
  RESULTADO_ANCLADO,
  RESULTADO_YA_ANCLADO,
  RESULTADO_FALLIDO,
  ESTADO_SIN_REGISTROS,
  ESTADO_EXITO,
  ESTADO_PARCIAL,
  ESTADO_TODOS_FALLIDOS,
  ESTADO_SIN_CAMBIOS,
} = require("../src/resumen");

/**
 * El cierre del proceso diario tiene que describir lo que pasó, no lo que se
 * quiso hacer. Estos tests verifican el estado y los cuatro conteos, no la
 * redacción literal: un mensaje engañoso distinto también tiene que ser
 * detectable, y una frase honesta no debe quedar prohibida por su vocabulario.
 */

function anclado() {
  return { resultado: RESULTADO_ANCLADO };
}

function yaAnclado() {
  return { resultado: RESULTADO_YA_ANCLADO };
}

function fallido() {
  return { resultado: RESULTADO_FALLIDO };
}

// El encabezado informa las cuatro cifras con su etiqueta: no alcanza con que
// los números aparezcan sueltos en el texto.
function expectCifras(
  encabezado,
  { procesados, anclados, yaAnclados, fallidos }
) {
  expect(encabezado).to.include(`procesados: ${procesados}`);
  expect(encabezado).to.include(`anclados: ${anclados}`);
  expect(encabezado).to.include(`yaAnclados: ${yaAnclados}`);
  expect(encabezado).to.include(`fallidos: ${fallidos}`);
}

describe("Resumen fiel del lote diario", function () {
  it("con el lote vacío informa SIN_REGISTROS y no dice que procesó algo", function () {
    const resumen = resumirLote([]);

    expect(resumen.estado).to.equal(ESTADO_SIN_REGISTROS);
    expect(resumen.procesados).to.equal(0);
    expect(resumen.anclados).to.equal(0);
    expect(resumen.yaAnclados).to.equal(0);
    expect(resumen.fallidos).to.equal(0);
    expectCifras(resumen.encabezado, {
      procesados: 0,
      anclados: 0,
      yaAnclados: 0,
      fallidos: 0,
    });

    expect(resumen.encabezado).to.match(/no había registros/i);
  });

  it("con todos los registros anclados en esta corrida informa EXITO", function () {
    const resumen = resumirLote([anclado(), anclado()]);

    expect(resumen.estado).to.equal(ESTADO_EXITO);
    expect(resumen.procesados).to.equal(2);
    expect(resumen.anclados).to.equal(2);
    expect(resumen.yaAnclados).to.equal(0);
    expect(resumen.fallidos).to.equal(0);
    expectCifras(resumen.encabezado, {
      procesados: 2,
      anclados: 2,
      yaAnclados: 0,
      fallidos: 0,
    });
  });

  it("con algunos anclados y algunos fallidos informa PARCIAL", function () {
    const resumen = resumirLote([anclado(), fallido()]);

    expect(resumen.estado).to.equal(ESTADO_PARCIAL);
    expect(resumen.procesados).to.equal(2);
    expect(resumen.anclados).to.equal(1);
    expect(resumen.yaAnclados).to.equal(0);
    expect(resumen.fallidos).to.equal(1);
    expectCifras(resumen.encabezado, {
      procesados: 2,
      anclados: 1,
      yaAnclados: 0,
      fallidos: 1,
    });

    expect(resumen.encabezado).to.match(/parcial/i);
  });

  it("con todos fallidos informa TODOS_FALLIDOS y no celebra el cierre", function () {
    const resumen = resumirLote([fallido(), fallido()]);

    expect(resumen.estado).to.equal(ESTADO_TODOS_FALLIDOS);
    expect(resumen.procesados).to.equal(2);
    expect(resumen.anclados).to.equal(0);
    expect(resumen.yaAnclados).to.equal(0);
    expect(resumen.fallidos).to.equal(2);
    expectCifras(resumen.encabezado, {
      procesados: 2,
      anclados: 0,
      yaAnclados: 0,
      fallidos: 2,
    });

    expect(resumen.encabezado).to.not.match(/🎉/);
  });

  it("con todos ya anclados informa SIN_CAMBIOS sin presentarlo como fallo ni éxito", function () {
    const resumen = resumirLote([yaAnclado(), yaAnclado()]);

    expect(resumen.estado).to.equal(ESTADO_SIN_CAMBIOS);
    expect(resumen.procesados).to.equal(2);
    expect(resumen.anclados).to.equal(0);
    expect(resumen.yaAnclados).to.equal(2);
    expect(resumen.fallidos).to.equal(0);
    expectCifras(resumen.encabezado, {
      procesados: 2,
      anclados: 0,
      yaAnclados: 2,
      fallidos: 0,
    });

    // No es un fallo: el registro sí está en la cadena desde antes.
    expect(resumen.encabezado).to.not.match(/❌/);
    // No es un éxito de esta corrida: no se ancló nada nuevo.
    expect(resumen.encabezado).to.not.match(/🎉/);
  });

  it("los cinco estados producen encabezados distintos con sus cifras", function () {
    const resumenes = [
      resumirLote([]),
      resumirLote([anclado()]),
      resumirLote([anclado(), fallido()]),
      resumirLote([fallido()]),
      resumirLote([yaAnclado()]),
    ];

    const encabezados = resumenes.map((resumen) => resumen.encabezado);
    expect(new Set(encabezados).size).to.equal(5);

    // Los cierres que no son un éxito no pueden reutilizar el texto de EXITO.
    const encabezadoExito = resumenes[1].encabezado;
    [resumenes[2], resumenes[3], resumenes[4]].forEach((resumen) => {
      expect(resumen.encabezado).to.not.equal(encabezadoExito);
      expectCifras(resumen.encabezado, resumen);
    });
  });

  it("cada paciente procesado cuenta exactamente una vez", function () {
    const resumen = resumirLote([
      anclado(),
      fallido(),
      anclado(),
      fallido(),
      yaAnclado(),
    ]);

    expect(resumen.procesados).to.equal(5);
    expect(resumen.anclados).to.equal(2);
    expect(resumen.yaAnclados).to.equal(1);
    expect(resumen.fallidos).to.equal(2);
    expect(resumen.anclados + resumen.yaAnclados + resumen.fallidos).to.equal(
      resumen.procesados
    );
    expect(resumen.estado).to.equal(ESTADO_PARCIAL);
  });

  it("no cuenta un anclaje previo como fallo ni como anclaje nuevo", function () {
    const resumen = resumirLote([anclado(), yaAnclado()]);

    // Hubo anclaje nuevo y ningún fallo: el lote es un éxito, aunque no todo
    // se haya anclado en esta corrida.
    expect(resumen.estado).to.equal(ESTADO_EXITO);
    expect(resumen.anclados).to.equal(1);
    expect(resumen.yaAnclados).to.equal(1);
    expect(resumen.fallidos).to.equal(0);
  });

  it("clasifica el estado por el resultado, no por la cantidad", function () {
    expect(resumirLote([anclado()]).estado).to.equal(ESTADO_EXITO);
    expect(resumirLote([fallido()]).estado).to.equal(ESTADO_TODOS_FALLIDOS);
    expect(resumirLote([yaAnclado()]).estado).to.equal(ESTADO_SIN_CAMBIOS);
    expect(resumirLote([anclado(), fallido()]).estado).to.equal(
      ESTADO_PARCIAL
    );
  });

  it("rechaza una entrada que no sea un arreglo", function () {
    [null, undefined, {}, "resultados", 42].forEach((entrada) => {
      expect(() => resumirLote(entrada), String(entrada)).to.throw(
        /se esperaba un arreglo/i
      );
    });
  });
});
