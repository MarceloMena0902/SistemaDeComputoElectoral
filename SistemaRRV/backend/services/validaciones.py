from typing import Dict, Tuple, List

class ValidadorActas:
    
    @staticmethod
    def validar_regla1(habilitados: int, votos_emitidos: int, papeletas_no_usadas: int) -> Tuple[bool, str, int]:
        """
        Regla 1: habilitados = votos_emitidos + papeletas_no_usadas
        """
        esperado = votos_emitidos + papeletas_no_usadas
        cumple = (habilitados == esperado)
        diferencia = habilitados - esperado
        mensaje = f"Regla1: habilitados={habilitados}, esperado={esperado}, diff={diferencia}"
        return cumple, mensaje, diferencia
    
    @staticmethod
    def validar_regla2(votos_validos: int, partidos: Dict[str, int], votos_blancos: int) -> Tuple[bool, str, int]:
        """
        Regla 2: votos_validos = suma(partidos) + votos_blancos
        """
        suma_partidos = sum(partidos.values())
        esperado = suma_partidos + votos_blancos
        cumple = (votos_validos == esperado)
        diferencia = votos_validos - esperado
        mensaje = f"Regla2: validos={votos_validos}, suma_partidos={suma_partidos}, blancos={votos_blancos}, esperado={esperado}"
        return cumple, mensaje, diferencia
    
    @staticmethod
    def validar_regla3(boletas_anfora: int, votos_validos: int, votos_nulos: int) -> Tuple[bool, str, int]:
        """
        Regla 3: boletas_anfora = votos_validos + votos_nulos
        """
        esperado = votos_validos + votos_nulos
        cumple = (boletas_anfora == esperado)
        diferencia = boletas_anfora - esperado
        mensaje = f"Regla3: anfora={boletas_anfora}, validos={votos_validos}, nulos={votos_nulos}, esperado={esperado}"
        return cumple, mensaje, diferencia
    
    @staticmethod
    def validar_acta_completa(acta_data: dict) -> Tuple[bool, List[str], dict]:
        """
        Valida todas las reglas del acta
        Retorna: (cumple, lista_errores, detalles_validacion)
        """
        errores = []
        detalles = {}
        
        votos = acta_data.get('votos', {})
        mesa = acta_data.get('mesa', {})
        
        # Obtener partidos
        partidos = {}
        for i in range(1, 7):
            key = f'partido{i}'
            if key in votos and votos[key] is not None:
                partidos[key] = votos[key]
        
        # Regla 1
        if 'cantidad_habilitados' in mesa and 'total_votos' in votos:
            cumple, msg, diff = ValidadorActas.validar_regla1(
                mesa.get('cantidad_habilitados', 0),
                votos.get('total_votos', 0),
                votos.get('papeletas_no_usadas', 0)
            )
            detalles['regla1'] = {'cumple': cumple, 'mensaje': msg, 'diferencia': diff}
            if not cumple:
                errores.append(msg)
        
        # Regla 2
        if 'votos_validos' in votos:
            cumple, msg, diff = ValidadorActas.validar_regla2(
                votos.get('votos_validos', 0),
                partidos,
                votos.get('votos_blancos', 0)
            )
            detalles['regla2'] = {'cumple': cumple, 'mensaje': msg, 'diferencia': diff}
            if not cumple:
                errores.append(msg)
        
        # Regla 3
        if 'total_votos' in votos:
            cumple, msg, diff = ValidadorActas.validar_regla3(
                votos.get('total_votos', 0),
                votos.get('votos_validos', 0),
                votos.get('votos_nulos', 0)
            )
            detalles['regla3'] = {'cumple': cumple, 'mensaje': msg, 'diferencia': diff}
            if not cumple:
                errores.append(msg)
        
        todas_cumplen = len(errores) == 0
        return todas_cumplen, errores, detalles