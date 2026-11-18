# 📘 Manual de Usuario y Operación del Sistema — MiMedicación

> **Materia:** Blockchain y Sistemas Distribuidos  
> **Institución:** Universidad Provincial de Ezeiza (UPE)  
> **Proyecto:** MiMedicación (Notariado Criptográfico para Adultos Mayores)  
> **Autores:** Equipo MiMedicación  
> **Versión:** 1.0 (Noviembre 2026)  

---

## 🎯 1. Introducción y Propósito

Este manual documenta el funcionamiento operativo de la capa blockchain de la aplicación **MiMedicación**. 

El sistema resuelve un problema crítico en salud digital: **cómo garantizar la inmutabilidad y autenticidad del registro de tomas de medicamentos de adultos mayores sin vulnerar las leyes de secreto médico y protección de datos personales (Ley 25.326)**.

### La Solución: Arquitectura Híbrida (Data Anchoring)
```text
┌────────────────────────────────────────────────────────────────────────┐
│                   CAPA OPERATIVA PRIVADA (OFF-CHAIN)                   │
│                                                                        │
│   [Cuidador / Adulto Mayor]                                            │
│              │                                                         │
│              ▼                                                         │
│   [Base de Datos Backend Node.js]                                      │
│   - Registro clínico diario: Paciente, Dosis, Horarios, Cuidador       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 23:59hs: Cierre Diario
                                    │ Generación de Hash SHA-256 (32 bytes)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   CAPA DE CONFIANZA PÚBLICA (ON-CHAIN)                 │
│                                                                        │
│   [Smart Contract: RegistroMedicacion en Sepolia]                     │
│   - Sella únicamente: mapping(pacienteId => fecha => hash)             │
│   - Notario digital descentralizado e inalterable                      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 👥 2. Perfiles y Roles de Usuario

1. **Operador Técnico / Backend:** Administra la wallet autorizada del sistema, ejecuta el script de despliegue y mantiene el servicio de cron job diario.
2. **Cuidador / Enfermero / Adulto Mayor:** Registra las tomas de medicamentos en la app móvil/web (interfaz accesible). No necesita interactuar con MetaMask ni pagar gas.
3. **Auditor Médico / Perito Judicial / Familiar:** Persona u organismo que requiere auditar si los registros históricos de un paciente fueron adulterados o si son 100% auténticos.

---

## 📸 3. Guía de Escenarios Operativos y Demostración

A continuación se detallan los 5 escenarios clave para evaluar y demostrar el sistema.

---

### 🔹 ESCENARIO 1: Despliegue del Notario Digital y Verificación en Sepolia

#### Objetivo:
Publicar el Smart Contract `RegistroMedicacion.sol` en la red de pruebas descentralizada de Ethereum Sepolia y vincularlo al backend.

#### Procedimiento:
1. Abrir la terminal de Visual Studio Code (`Ctrl + Ñ`).
2. Ejecutar el comando de despliegue:
   ```bash
   npm run deploy:sepolia
   ```
3. El script compila el código, firma la transacción con la clave del backend y devuelve la dirección pública del contrato.
4. El script informa la dirección y la guarda en `src/deployment-info.json`. Después hay que copiarla a mano en `CONTRACT_ADDRESS` del archivo `.env` (el script no lo edita).

> 📷 **Captura de Pantalla 1 — Despliegue y Confirmación en Etherscan:**  
> *(Pega aquí la captura de tu terminal mostrando el contrato desplegado y la pestaña del navegador con Sepolia Etherscan)*  
> 
> ![Escenario 1 - Despliegue en Sepolia](./capturas/01_despliegue_etherscan.png)

---

### 🔹 ESCENARIO 2: Cierre Diario Automatizado y Notarización (Cron Job)

#### Objetivo:
Simular el proceso que ocurre automáticamente cada noche a las 23:59 hs: consolidar las tomas de los pacientes, calcular el hash criptográfico SHA-256 y enviarlo a Ethereum.

#### Procedimiento:
1. Ejecutar el modo de demostración inmediata:
   ```bash
   npm run cron:test
   ```
2. La terminal mostrará:
   - Lectura de los registros clínicos simulados (Don Carlos de 82 años y Doña Rosa de 77 años).
   - Generación determinista del hash SHA-256 de 32 bytes (comienza con `0x...`).
   - Envío de la transacción firmada a Sepolia y minado en el bloque.
   - Enlace directo al explorador de bloques para verificar la transacción.

> 📷 **Captura de Pantalla 2 — Ejecución del Cron Job y Sello Criptográfico:**  
> *(Pega aquí la captura de la consola ejecutando el comando y mostrando el Transaction Hash)*  
> 
> ![Escenario 2 - Notarización Exitosa](./capturas/02_cron_anclaje_exitoso.png)

---

### 🔹 ESCENARIO 3: Auditoría Pública del Evento `HashRegistrado` en Etherscan

#### Objetivo:
Demostrar a los evaluadores que cualquier persona u organismo externo puede inspeccionar la blockchain pública y verificar cuándo se selló el registro sin ver datos privados del paciente.

#### Procedimiento:
1. Ingresar en el navegador a: `https://sepolia.etherscan.io/address/TU_CONTRACT_ADDRESS`.
2. Dirigirse a la pestaña **`Events` (Eventos)** o **`Logs`**.
3. Se observará la emisión del evento:
   ```solidity
   event HashRegistrado(
       string indexed pacienteId,
       string indexed fecha,
       bytes32 hashRegistro,
       uint256 timestamp
   );
   ```
4. Los parámetros indexados permiten auditar en milisegundos qué paciente y qué fecha fueron notariados, junto con la marca de tiempo exacta del bloque.

> 📷 **Captura de Pantalla 3 — Evento en Sepolia Etherscan:**  
> *(Pega aquí la captura de la pestaña Events de Etherscan mostrando el evento HashRegistrado)*  
> 
> ![Escenario 3 - Evento en Etherscan](./capturas/03_evento_etherscan.png)

---

### 🔹 ESCENARIO 4: Prueba de Inviolabilidad (Rechazo de Sobreescritura)

#### Objetivo:
Probar que el sistema es inmutable y que nadie (ni siquiera el administrador del servidor) puede alterar retroactivamente un registro ya sellado.

#### Procedimiento:
1. Ejecutar nuevamente la notarización para el mismo paciente y la misma fecha:
   ```bash
   npm run cron:test
   ```
2. El Smart Contract detectará que el registro ya existe en el mapping (`_registros[pacienteId][fecha].existe == true`).
3. La transacción es rechazada automáticamente por la EVM con el error personalizado:
   ```solidity
   error RegistroYaExistente(string pacienteId, string fecha);
   ```

> 📷 **Captura de Pantalla 4 — Detección de Violación de Inmutabilidad:**  
> *(Pega aquí la captura del error en consola garantizando que no se puede sobreescribir)*  
> 
> ![Escenario 4 - Error RegistroYaExistente](./capturas/04_inmutabilidad_rechazo.png)

---

### 🔹 ESCENARIO 5: Auditoría Criptográfica y Detección de Fraude en Tiempo Real

#### Objetivo:
Demostrar el **Efecto Avalancha** de la función resumen SHA-256: si un atacante altera un solo carácter en la base de datos (por ejemplo, cambia la dosis de "10 mg" a "20 mg" o altera la hora de una toma), el sistema expone el fraude al instante.

#### Procedimiento:
1. Ejecutar el script especializado de auditoría:
   ```bash
   npm run demo:auditoria
   ```
2. El script ejecuta tres fases:
   - **Caso A (Registro Genuino):** Compara el hash de la base contra el sellado en Sepolia. Retorna `INTEGRO` con el mensaje de integridad confirmada.
   - **Caso B (Registro Adulterado):** Simula que alguien cambió una dosis. Retorna `ALTERADO` con la alerta de seguridad.
   - **Caso C (Registro nunca anclado):** Retorna `NO_ANCLADO`, aclarando que la ausencia de anclaje no es una alteración ni un fraude.

> 📷 **Captura de Pantalla 5 — Detección de Fraude por Efecto Avalancha:**  
> *(Pega aquí la captura de la consola demostrando la alerta de seguridad en vivo)*  
> 
> ![Escenario 5 - Auditoría y Detección de Fraude](./capturas/05_auditoria_deteccion_fraude.png)

---

## 📁 4. Instrucciones para Guardar las Capturas

Para mantener el repositorio prolijo y listo para el jurado o compañeros:
1. En la carpeta `docs/`, crea una subcarpeta llamada `capturas/` (o guarda los archivos directamente con los siguientes nombres):
   - `docs/capturas/01_despliegue_etherscan.png`
   - `docs/capturas/02_cron_anclaje_exitoso.png`
   - `docs/capturas/03_evento_etherscan.png`
   - `docs/capturas/04_inmutabilidad_rechazo.png`
   - `docs/capturas/05_auditoria_deteccion_fraude.png`
2. Cuando las guardes con esos nombres exactos, el archivo Markdown cargará automáticamente tus imágenes.

---

## 📖 5. Glosario para no especialistas

- **Data Anchoring:** Técnica arquitectónica donde datos voluminosos o privados se procesan fuera de la blockchain, y solo una prueba matemática de su existencia (hash) se guarda en la cadena.
- **Efecto Avalancha:** Propiedad de los algoritmos de hash criptográficos según la cual una modificación microscópica en la entrada genera una salida totalmente divergente y no correlacionada.
- **EVM (Ethereum Virtual Machine):** Motor de cómputo descentralizado donde se ejecutan los Smart Contracts.
- **Gas:** Unidad de medida del trabajo computacional necesario para ejecutar transacciones en la red Ethereum.
- **Testnet Sepolia:** Red de pruebas oficial de Ethereum que reproduce exactamente las reglas de la red principal (Mainnet) pero con tokens gratuitos sin valor financiero.
