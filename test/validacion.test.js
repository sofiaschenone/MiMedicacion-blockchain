const { expect } = require("chai");

const {
  validarFechaRegistro,
  fechaDeRegistroHoy,
} = require("../src/validacion");
const {
  generarHashDiario,
  guardarHashEnBlockchain,
  CODIGO_FECHA_INVALIDA,
} = require("../src/blockchainService");

// Única tabla de fechas inválidas: cubre tanto los formatos que no son
// "YYYY-MM-DD" como las fechas bien formadas que no existen en el calendario.
const FECHAS_INVALIDAS = [
  // Formato incorrecto
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
  // Formato correcto pero inexistente en el calendario
  "2026-02-31",
  "2026-02-30",
  "2026-04-31",
  "2026-00-10",
  "2026-12-00",
  "2026-01-32",
  "2025-02-29", // 2025 no es bisiesto
  "2026-02-29", // 2026 tampoco es bisiesto
];

describe("Validación de la fecha de registro", function () {
  describe("validarFechaRegistro: fechas inválidas", function () {
    FECHAS_INVALIDAS.forEach((fecha) => {
      it(`rechaza "${fecha}"`, function () {
        expect(() => validarFechaRegistro(fecha)).to.throw(/fecha de registro/i);
      });
    });
  });

  describe("validarFechaRegistro: valores que no son texto", function () {
    it("rechaza valores que no son texto", function () {
      [null, undefined, 20260228, {}, ["2026-02-28"]].forEach((fecha) => {
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

    FECHAS_INVALIDAS.forEach((fecha) => {
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

  describe("guardarHashEnBlockchain: la fecha se valida antes de tocar la red", function () {
    // Configuración deliberadamente inválida durante estas pruebas: si la función
    // intentara resolver el contrato antes de validar la fecha, fallaría con un
    // error de configuración y el test lo delataría.
    const entornoOriginal = {
      PRIVATE_KEY: process.env.PRIVATE_KEY,
      CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS,
      SEPOLIA_RPC_URL: process.env.SEPOLIA_RPC_URL,
      ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY,
    };

    function restaurarEntorno() {
      Object.entries(entornoOriginal).forEach(([clave, valor]) => {
        if (valor === undefined) {
          delete process.env[clave];
        } else {
          process.env[clave] = valor;
        }
      });
    }

    beforeEach(function () {
      process.env.PRIVATE_KEY = "0".repeat(64);
      process.env.CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000";
      process.env.SEPOLIA_RPC_URL = "http://127.0.0.1:1";
      delete process.env.ALCHEMY_API_KEY;
    });

    afterEach(restaurarEntorno);
    after(restaurarEntorno);

    it("lanza el error de validación de fecha y no el de configuración", async function () {
      const hash = `0x${"ab".repeat(32)}`;

      let error;
      try {
        await guardarHashEnBlockchain("PAC_001", "31/02/2026", hash);
      } catch (err) {
        error = err;
      }

      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.match(/fecha de registro inválida/i);
      expect(error.message).to.not.match(/configuración inválida/i);
      expect(error.codigo).to.equal(CODIGO_FECHA_INVALIDA);
    });
  });
});
