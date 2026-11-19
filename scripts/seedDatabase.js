/**
 * @file seedDatabase.js
 * @description Script para inicializar la base de datos en la nube (MongoDB Atlas / Supabase / Local)
 *              con los pacientes de prueba de MiMedicación.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const db = require("../src/db");
const { fechaDeRegistroHoy } = require("../src/validacion");

// La fecha del lote se toma del día calendario argentino, igual que el cron y el
// anclaje: usar UTC acá desincronizaba la base de datos con la blockchain después
// de las 21:00 ART. SEED_FECHA permite fijar otra fecha (por ejemplo, para dejar
// preparada una demostración con anticipación).
const FECHA_DEL_LOTE = process.env.SEED_FECHA || fechaDeRegistroHoy();

const pacientesIniciales = [
  {
    paciente: "PAC_001",
    nombrePaciente: "Don Carlos Alberto Martínez",
    edad: 82,
    fecha: FECHA_DEL_LOTE,
    cuidadorResponsable: "Lic. Mariana López (Mat. 44.912)",
    historiaClinica: "HC-88219-UPE",
    diagnostico: "Hipertensión arterial primaria y Diabetes tipo 2",
    tomas: [
      {
        id: "toma_001",
        horaProgramada: "08:00",
        horaEfectiva: "08:05",
        medicamento: "Enalapril 10 mg",
        dosis: "1 comprimido",
        estado: "TOMADO",
        observaciones: "Ingesta matutina con agua. Presión arterial: 120/80 mmHg."
      },
      {
        id: "toma_002",
        horaProgramada: "13:00",
        horaEfectiva: "13:15",
        medicamento: "Metformina 850 mg",
        dosis: "1 comprimido",
        estado: "TOMADO",
        observaciones: "Administrado junto con el almuerzo."
      },
      {
        id: "toma_003",
        horaProgramada: "21:00",
        horaEfectiva: "21:02",
        medicamento: "Atorvastatina 20 mg",
        dosis: "1 comprimido",
        estado: "TOMADO",
        observaciones: "Toma nocturna antes del descanso."
      }
    ]
  },
  {
    paciente: "PAC_002",
    nombrePaciente: "Doña Rosa Nélida Fernández",
    edad: 77,
    fecha: FECHA_DEL_LOTE,
    cuidadorResponsable: "Jorge Fernández (Familiar Registrado)",
    historiaClinica: "HC-71402-UPE",
    diagnostico: "Hipotiroidismo e Hipertensión leve",
    tomas: [
      {
        id: "toma_004",
        horaProgramada: "07:30",
        horaEfectiva: "07:32",
        medicamento: "Levotiroxina 50 mcg",
        dosis: "1 comprimido",
        estado: "TOMADO",
        observaciones: "En ayunas, 30 minutos antes del desayuno."
      },
      {
        id: "toma_005",
        horaProgramada: "20:00",
        horaEfectiva: "20:10",
        medicamento: "Losartán 50 mg",
        dosis: "1 comprimido",
        estado: "TOMADO",
        observaciones: "Control de presión vespertino: 125/82 mmHg."
      }
    ]
  }
];

async function seed() {
  console.log("🌱 Inicializando base de datos de MiMedicación...");
  for (const paciente of pacientesIniciales) {
    console.log(`Guardando: ${paciente.nombrePaciente} (${paciente.paciente})...`);
    await db.guardarPaciente(paciente);
  }
  console.log("✅ Base de datos inicializada exitosamente.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Error al sembrar base de datos:", err);
  process.exit(1);
});
