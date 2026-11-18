/**
 * @file db.js
 * @description Capa de persistencia de datos para MiMedicación.
 *              Soporta:
 *              1. MongoDB Atlas Cloud (Tier Gratuito M0)
 *              2. Supabase PostgreSQL Cloud (Tier Gratuito)
 *              3. Almacenamiento persistente en JSON (fallback sin dependencias externas)
 * @institution Universidad Provincial de Ezeiza (UPE)
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config();

const DATA_FILE = path.join(__dirname, "../data/pacientes.json");

// Intento opcional de requerir mongoose si está disponible
let mongoose = null;
try {
  mongoose = require("mongoose");
} catch (e) {
  // Mongoose no disponible en el entorno local offline; se usa fallback transparente
}

let mongoConnected = false;
let PacienteModel = null;

// Esquema de Mongoose para MongoDB Atlas
if (mongoose) {
  const TomaSchema = new mongoose.Schema({
    id: String,
    horaProgramada: String,
    horaEfectiva: String,
    medicamento: String,
    dosis: String,
    estado: String,
    observaciones: String,
  }, { _id: false });

  const PacienteSchema = new mongoose.Schema({
    paciente: { type: String, required: true, unique: true },
    nombrePaciente: String,
    edad: Number,
    fecha: String,
    cuidadorResponsable: String,
    historiaClinica: String,
    diagnostico: String,
    tomas: [TomaSchema],
  }, { timestamps: true });

  try {
    PacienteModel = mongoose.model("Paciente", PacienteSchema);
  } catch (e) {
    PacienteModel = mongoose.models.Paciente;
  }
}

/**
 * Conexión a MongoDB Atlas Cloud
 */
async function conectarMongoSiEsPosible() {
  const uri = process.env.MONGODB_URI;
  if (!uri || !mongoose || mongoConnected) return mongoConnected;

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    mongoConnected = true;
    console.log("☁️ [Base de Datos] Conectado exitosamente a MongoDB Atlas Cloud (Tier Gratuito M0)");
    return true;
  } catch (error) {
    console.warn("⚠️ [Base de Datos] No se pudo conectar a MongoDB Atlas. Usando almacenamiento persistente local:", error.message);
    mongoConnected = false;
    return false;
  }
}

/**
 * Conexión / Consulta a Supabase PostgreSQL Cloud (vía REST API nativa con fetch, sin librerías)
 */
async function consultarSupabase(endpoint, options = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  try {
    const url = `${supabaseUrl}/rest/v1/${endpoint}`;
    const headers = {
      "apikey": supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    };

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) throw new Error(`Supabase error ${res.status}: ${res.statusText}`);
    return await res.json();
  } catch (error) {
    console.warn("⚠️ [Base de Datos] Falló consulta a Supabase Cloud:", error.message);
    return null;
  }
}

/**
 * Lectura de almacenamiento local
 */
function leerArchivoLocal() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DATA_FILE, "[]", "utf8");
      return [];
    }
    const contenido = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(contenido || "[]");
  } catch (error) {
    console.error("Error al leer archivo local de pacientes:", error);
    return [];
  }
}

/**
 * Escritura en almacenamiento local
 */
function guardarArchivoLocal(datos) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(datos, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Error al guardar archivo local de pacientes:", error);
    return false;
  }
}

/**
 * Obtener todos los pacientes
 */
async function obtenerTodosLosPacientes() {
  // 1. Probar MongoDB Atlas
  if (await conectarMongoSiEsPosible()) {
    try {
      const pacientes = await PacienteModel.find({}).lean();
      if (pacientes && pacientes.length > 0) return pacientes;
    } catch (e) {
      console.warn("Error leyendo de MongoDB Atlas, intentando fuentes secundarias:", e.message);
    }
  }

  // 2. Probar Supabase Cloud
  const desdeSupabase = await consultarSupabase("pacientes?select=*");
  if (desdeSupabase && Array.isArray(desdeSupabase) && desdeSupabase.length > 0) {
    return desdeSupabase;
  }

  // 3. Fallback: Archivo persistente local
  return leerArchivoLocal();
}

/**
 * Obtener paciente por ID
 */
async function obtenerPacientePorId(pacienteId) {
  const lista = await obtenerTodosLosPacientes();
  return lista.find((p) => p.paciente === pacienteId) || null;
}

/**
 * Guardar o actualizar paciente completo
 */
async function guardarPaciente(pacienteObj) {
  // Actualizar fecha al día de hoy si no viene establecida
  if (!pacienteObj.fecha) {
    pacienteObj.fecha = new Date().toISOString().split("T")[0];
  }

  // 1. Guardar en MongoDB Atlas si está activo
  if (await conectarMongoSiEsPosible()) {
    try {
      await PacienteModel.findOneAndUpdate(
        { paciente: pacienteObj.paciente },
        pacienteObj,
        { upsert: true, new: true }
      );
    } catch (e) {
      console.warn("Error guardando en MongoDB Atlas:", e.message);
    }
  }

  // 2. Guardar en Supabase si está activo
  await consultarSupabase("pacientes", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify(pacienteObj),
  });

  // 3. Guardar siempre en almacenamiento persistente local
  const lista = leerArchivoLocal();
  const idx = lista.findIndex((p) => p.paciente === pacienteObj.paciente);
  if (idx >= 0) {
    lista[idx] = pacienteObj;
  } else {
    lista.push(pacienteObj);
  }
  guardarArchivoLocal(lista);

  return pacienteObj;
}

/**
 * Agregar una nueva toma a un paciente
 */
async function agregarToma(pacienteId, nuevaToma) {
  const paciente = await obtenerPacientePorId(pacienteId);
  if (!paciente) throw new Error(`Paciente '${pacienteId}' no encontrado.`);

  if (!nuevaToma.id) {
    nuevaToma.id = `toma_${Date.now()}`;
  }
  if (!nuevaToma.estado) {
    nuevaToma.estado = "TOMADO";
  }
  if (!nuevaToma.horaEfectiva) {
    const ahora = new Date();
    nuevaToma.horaEfectiva = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
  }

  paciente.tomas.push(nuevaToma);
  await guardarPaciente(paciente);
  return paciente;
}

/**
 * Actualizar estado de una toma (ej: marcar como TOMADO / PENDIENTE)
 */
async function actualizarEstadoToma(pacienteId, tomaId, nuevoEstado) {
  const paciente = await obtenerPacientePorId(pacienteId);
  if (!paciente) throw new Error(`Paciente '${pacienteId}' no encontrado.`);

  const toma = paciente.tomas.find((t) => t.id === tomaId);
  if (!toma) throw new Error(`Toma con ID '${tomaId}' no encontrada.`);

  toma.estado = nuevoEstado;
  if (nuevoEstado === "TOMADO") {
    const ahora = new Date();
    toma.horaEfectiva = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
  }

  await guardarPaciente(paciente);
  return paciente;
}

/**
 * Obtener estado de la base de datos
 */
function obtenerEstadoDB() {
  if (mongoConnected) {
    return {
      motor: "MongoDB Atlas Cloud",
      tipo: "Cloud Database (Tier M0 Gratuito)",
      estado: "En línea",
    };
  }
  if (process.env.SUPABASE_URL) {
    return {
      motor: "Supabase PostgreSQL Cloud",
      tipo: "Cloud Database (Tier Gratuito)",
      estado: "En línea",
    };
  }
  return {
    motor: "Almacenamiento Persistente JSON",
    tipo: "Base de Datos Local / Sin costo",
    estado: "En línea",
  };
}

module.exports = {
  obtenerTodosLosPacientes,
  obtenerPacientePorId,
  guardarPaciente,
  agregarToma,
  actualizarEstadoToma,
  obtenerEstadoDB,
};
