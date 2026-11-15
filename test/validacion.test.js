const { expect } = require("chai");

const {
  validarFechaRegistro,
  fechaDeRegistroHoy,
} = require("../src/validacion");
const { generarHashDiario } = require("../src/blockchainService");

describe("Validación de la fecha de registro", function () {
  describe("validarFechaRegistro: formatos rechazados", function () {
    const formatosInvalidos = [
      "31/02/2026",
      "2026-13-01",
      "2026-2-3",
      "2026/02/28",
      "28-02-2026",
      "20260228",
      "2026-02-28T00:00:00Z",
      " 2026-02-28",
      "2026-02-28 ",
      "",
    ];

    formatosInvalidos.forEach((fecha) => {
      it(`rechaza "${fecha}"`, function () {
        expect(() => validarFechaRegistro(fecha)).to.throw(/fecha de registro/i);
      });
    });

    it("rechaza valores que no son texto", function () {
      [null, undefined, 20260228, {}, ["2026-02-28"]].forEach((fecha) => {
        expect(() => validarFechaRegistro(fecha)).to.throw(/fecha de registro/i);
      });
    });
  });

  describe("validarFechaRegistro: fechas inexistentes en el calendario", function () {
    const fechasInexistentes = [
      "2026-02-31",
      "2026-02-30",
      "2026-04-31",
      "2026-00-10",
      "2026-12-00",
      "2026-01-32",
      "2025-02-29", // 2025 no es bisiesto
      "2026-02-29", // 2026 tampoco es bisiesto
    ];

    fechasInexistentes.forEach((fecha) => {
      it(`rechaza "${fecha}"`, function () {
        expect(() => validarFechaRegistro(fecha)).to.throw(/fecha de registro/i);
      });
    });
  });

  describe("validarFechaRegistro: fechas aceptadas", function () {
    const fechasValidas = [
      "2026-02-28",
      "2024-02-29", // año bisiesto
      "2028-02-29", // año bisiesto
      "2026-01-01",
      "2026-12-31",
      "2026-04-30",
    ];

    fechasValidas.forEach((fecha) => {
      it(`acepta "${fecha}"`, function () {
        expect(() => validarFechaRegistro(fecha)).to.not.throw();
      });
    });

    it("no devuelve nada cuando la fecha es válida", function () {
      expect(validarFechaRegistro("2026-11-13")).to.be.undefined;
    });
  });

  describe("fechaDeRegistroHoy: día calendario argentino", function () {
    it("a las 23:59 ART ya es el día siguiente en UTC, pero sigue siendo el día anterior en Argentina", function () {
      // 2026-03-01T02:59:00Z == 2026-02-28 23:59:00 en America/Argentina/Buenos_Aires (UTC-3)
      const ahora = new Date("2026-03-01T02:59:00Z");

      expect(ahora.toISOString().slice(0, 10)).to.equal("2026-03-01");
      expect(fechaDeRegistroHoy(ahora)).to.equal("2026-02-28");
    });

    it("a las 00:00 ART ya es el día nuevo en Argentina", function () {
      const ahora = new Date("2026-03-01T03:00:00Z"); // 2026-03-01 00:00 ART

      expect(fechaDeRegistroHoy(ahora)).to.equal("2026-03-01");
    });

    it("calcula correctamente un instante de enero (Argentina no aplica horario de verano)", function () {
      expect(fechaDeRegistroHoy(new Date("2026-01-15T02:59:59Z"))).to.equal("2026-01-14");
      expect(fechaDeRegistroHoy(new Date("2026-01-15T03:00:00Z"))).to.equal("2026-01-15");
    });

    it("devuelve el día calendario argentino en horario diurno", function () {
      expect(fechaDeRegistroHoy(new Date("2026-11-13T12:00:00Z"))).to.equal("2026-11-13");
    });

    it("con el reloj real devuelve un día calendario en formato YYYY-MM-DD", function () {
      expect(fechaDeRegistroHoy()).to.match(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("rechaza un instante inválido", function () {
      expect(() => fechaDeRegistroHoy(new Date("no-es-fecha"))).to.throw(/fecha/i);
    });
  });

  describe("generarHashDiario: la fecha inválida se rechaza antes de calcular el hash", function () {
    function datosConFecha(fecha) {
      return {
        paciente: "PAC_001",
        fecha,
        tomas: [{ medicamento: "Enalapril 10mg", hora: "08:00", estado: "TOMADO" }],
      };
    }

    ["31/02/2026", "2026-13-01", "2026-2-3", "2026-02-31"].forEach((fecha) => {
      it(`lanza un error comprensible con "${fecha}"`, function () {
        expect(() => generarHashDiario(datosConFecha(fecha))).to.throw(/fecha de registro/i);
      });
    });

    it("lanza un error si falta la fecha", function () {
      const datos = datosConFecha("2026-11-13");
      delete datos.fecha;

      expect(() => generarHashDiario(datos)).to.throw(/fecha de registro/i);
    });

    it("sigue calculando el hash con una fecha válida", function () {
      const hash = generarHashDiario(datosConFecha("2026-11-13"));

      expect(hash).to.match(/^0x[0-9a-f]{64}$/);
      expect(generarHashDiario(datosConFecha("2026-11-13"))).to.equal(hash);
    });
  });
});
