// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RegistroMedicacion (Notario Digital de MiMedicación)
 * @author Equipo MiMedicación - Universidad Provincial de Ezeiza (UPE)
 * @notice Contrato inteligente diseñado bajo el patrón "Data Anchoring" (Anclaje de Datos).
 *         Sirve como un notario criptográfico inmutable para auditar el cumplimiento del plan
 *         de medicación de adultos mayores sin almacenar información médica confidencial
 *         (cumplimiento de leyes de protección de datos personales y privacidad médica).
 *
 * @dev ARQUITECTURA DE DATOS:
 *      - Los datos de salud (medicamentos, dosis, cuidadores) residen en la base de datos off-chain.
 *      - La blockchain únicamente almacena el hash criptográfico SHA-256 (32 bytes) correspondiente
 *        al resumen diario de las tomas del paciente.
 *      - Se utiliza bytes32 en lugar de string para el hash: SHA-256 produce 256 bits exactos,
 *        lo que cabe en un único storage slot de la EVM, reduciendo drásticamente el consumo de gas.
 */
contract RegistroMedicacion is Ownable {

    /// @dev Estructura interna para almacenar el hash y la marca de tiempo de la transacción.
    struct RegistroDiario {
        bytes32 hashRegistro; // Hash SHA-256 de los registros de toma del día
        uint256 timestamp;    // Marca de tiempo del bloque en que se ancló en la blockchain
        bool existe;          // Bandera booleana para verificar existencia sin ambigüedad
    }

    /**
     * @notice Mapeo bidimensional: ID del Paciente => Fecha ("YYYY-MM-DD") => RegistroDiario
     * @dev Ejemplo de acceso: registros["PACIENTE_001"]["2026-11-13"]
     */
    mapping(string => mapping(string => RegistroDiario)) private _registros;

    // ==========================================
    //                   EVENTOS
    // ==========================================

    /**
     * @notice Evento emitido cada vez que el backend ancla con éxito el hash de un día.
     * @param pacienteId Identificador del paciente (indexado para búsquedas rápidas en logs)
     * @param fecha Fecha del registro en formato YYYY-MM-DD (indexada)
     * @param hashRegistro Hash criptográfico SHA-256 del registro diario
     * @param timestamp Momento exacto de confirmación en la red Ethereum
     */
    event HashRegistrado(
        string indexed pacienteId,
        string indexed fecha,
        bytes32 hashRegistro,
        uint256 timestamp
    );

    // ==========================================
    //               ERRORES PERSONALIZADOS
    // ==========================================
    // El uso de Custom Errors ahorra gas respecto a require con strings largos.
    error IdentificadorVacio();
    error FechaVacia();
    error HashInvalido();
    error RegistroYaExistente(string pacienteId, string fecha);
    error RegistroNoEncontrado(string pacienteId, string fecha);

    // ==========================================
    //                 CONSTRUCTOR
    // ==========================================

    /**
     * @notice Inicializa el contrato asignando la wallet del backend como propietaria.
     * @dev Ownable transfiere la propiedad al creador (msg.sender) mediante OpenZeppelin v5.
     */
    constructor() Ownable(msg.sender) {}

    // ==========================================
    //           FUNCIONES DE ESCRITURA
    // ==========================================

    /**
     * @notice Registra de forma inmutable el hash diario de medicación de un paciente.
     * @dev Solo puede ser ejecutada por la cuenta autorizada del backend (modificador onlyOwner).
     *      Una vez registrado un hash para una fecha determinada, no puede ser alterado ni eliminado.
     *
     * @param pacienteId Identificador único del paciente (ej: "PAC_001")
     * @param fecha Fecha de las tomas en formato "YYYY-MM-DD" (ej: "2026-11-13")
     * @param hashRegistro Hash SHA-256 de 32 bytes del JSON con las tomas diarias
     */
    function registrarHash(
        string calldata pacienteId,
        string calldata fecha,
        bytes32 hashRegistro
    ) external onlyOwner {
        // Validaciones de entrada
        if (bytes(pacienteId).length == 0) revert IdentificadorVacio();
        if (bytes(fecha).length == 0) revert FechaVacia();
        if (hashRegistro == bytes32(0)) revert HashInvalido();

        // Garantía de inmutabilidad: evita que un registro ya sellado sea sobreescrito
        if (_registros[pacienteId][fecha].existe) {
            revert RegistroYaExistente(pacienteId, fecha);
        }

        // Almacenamiento en el estado inmutable de Ethereum
        _registros[pacienteId][fecha] = RegistroDiario({
            hashRegistro: hashRegistro,
            timestamp: block.timestamp,
            existe: true
        });

        // Emisión del evento para auditoría y observabilidad externa
        emit HashRegistrado(pacienteId, fecha, hashRegistro, block.timestamp);
    }

    // ==========================================
    //            FUNCIONES DE LECTURA
    // ==========================================

    /**
     * @notice Consulta el hash y la marca de tiempo de un paciente en una fecha específica.
     * @dev Función pública de solo lectura (sin costo de gas al ser llamada vía view/call).
     *
     * @param pacienteId Identificador del paciente
     * @param fecha Fecha en formato "YYYY-MM-DD"
     * @return hashRegistro Hash SHA-256 almacenado
     * @return timestamp Fecha y hora de minado del bloque en la blockchain
     */
    function consultarHash(
        string calldata pacienteId,
        string calldata fecha
    ) external view returns (bytes32 hashRegistro, uint256 timestamp) {
        RegistroDiario memory registro = _registros[pacienteId][fecha];
        if (!registro.existe) {
            revert RegistroNoEncontrado(pacienteId, fecha);
        }
        return (registro.hashRegistro, registro.timestamp);
    }

    /**
     * @notice Verifica matemáticamente si un conjunto de datos (representado por su hash calculado)
     *         coincide con el hash notariado en la blockchain.
     * @dev Útil para procesos de auditoría médica, peritajes o reclamos familiares.
     *
     * @param pacienteId Identificador del paciente
     * @param fecha Fecha correspondiente al registro
     * @param hashAValidar Hash SHA-256 que se desea cotejar
     * @return valido Verdadero si el hash coincide de forma exacta; falso si hubo manipulación
     */
    function verificarHash(
        string calldata pacienteId,
        string calldata fecha,
        bytes32 hashAValidar
    ) external view returns (bool valido) {
        RegistroDiario memory registro = _registros[pacienteId][fecha];
        if (!registro.existe) {
            return false;
        }
        return registro.hashRegistro == hashAValidar;
    }
}
