const { expect } = require("chai");
const { ethers } = require("hardhat");
const crypto = require("crypto");

describe("Smart Contract: RegistroMedicacion (Data Anchoring)", function () {
  let RegistroMedicacion;
  let registro;
  let owner;
  let otroUsuario;

  const pacienteId = "PAC_001";
  const fecha = "2026-11-13";
  const datosEjemplo = {
    paciente: pacienteId,
    fecha: fecha,
    tomas: [
      { medicamento: "Enalapril 10mg", hora: "08:00", estado: "TOMADO" },
      { medicamento: "Atorvastatina 20mg", hora: "21:00", estado: "TOMADO" }
    ]
  };

  // Cálculo del hash SHA-256 equivalente en pruebas
  const jsonCanonica = JSON.stringify(datosEjemplo);
  const hashValido = "0x" + crypto.createHash("sha256").update(jsonCanonica).digest("hex");

  beforeEach(async function () {
    [owner, otroUsuario] = await ethers.getSigners();
    RegistroMedicacion = await ethers.getContractFactory("RegistroMedicacion");
    registro = await RegistroMedicacion.deploy();
    await registro.waitForDeployment();
  });

  it("Debe asignar como owner al desplegador del contrato", async function () {
    expect(await registro.owner()).to.equal(owner.address);
  });

  it("El owner (backend) debe poder registrar un hash exitosamente y emitir el evento", async function () {
    await expect(registro.registrarHash(pacienteId, fecha, hashValido))
      .to.emit(registro, "HashRegistrado")
      .withArgs(pacienteId, fecha, hashValido, (await ethers.provider.getBlock("latest")).timestamp + 1);

    const [hashGuardado, timestamp] = await registro.consultarHash(pacienteId, fecha);
    expect(hashGuardado).to.equal(hashValido);
    expect(timestamp).to.be.gt(0);
  });

  it("Debe rechazar intentos de registro provenientes de una wallet no autorizada (onlyOwner)", async function () {
    await expect(
      registro.connect(otroUsuario).registrarHash(pacienteId, fecha, hashValido)
    ).to.be.revertedWithCustomError(registro, "OwnableUnauthorizedAccount");
  });

  it("Debe garantizar la inmutabilidad: no permitir sobrescribir una fecha ya anclada", async function () {
    await registro.registrarHash(pacienteId, fecha, hashValido);

    const hashNuevo = "0x" + crypto.createHash("sha256").update("datos alterados").digest("hex");
    await expect(
      registro.registrarHash(pacienteId, fecha, hashNuevo)
    ).to.be.revertedWithCustomError(registro, "RegistroYaExistente");
  });

  it("Debe verificar correctamente la autenticidad e integridad del hash", async function () {
    await registro.registrarHash(pacienteId, fecha, hashValido);

    // Hash idéntico => true
    expect(await registro.verificarHash(pacienteId, fecha, hashValido)).to.be.true;

    // Hash adulterado => false
    const hashAdulterado = "0x" + crypto.createHash("sha256").update("tomas manipuladas").digest("hex");
    expect(await registro.verificarHash(pacienteId, fecha, hashAdulterado)).to.be.false;
  });
});
