-- Referencia opcional para el modulo Formulario Oficial + Dashboard Comparativo.
-- La base real pertenece al backend oficial del equipo.
-- Este archivo NO reemplaza las migraciones oficiales del backend.

-- Campo opcional recomendado si el equipo quiere persistir notas tecnicas por separado.
-- Ejemplos: Aplanado ***, Recortado 2 cm por lado, Cambio de A4 a A0.

ALTER TABLE acta_oficial
ADD COLUMN IF NOT EXISTS observacion_tecnica TEXT;

-- Endpoint actual compatible:
-- El frontend puede enviar la observacion tecnica dentro de observacion
-- si el backend no tiene todavia esta columna.

-- Relacion conceptual usada por el frontend:
-- acta_oficial.id_acta -> voto_oficial.id_acta
-- acta_oficial.codigo_mesa -> mesa_electoral.codigo_mesa
-- mesa_electoral.codigo_recinto -> recinto_electoral.codigo_recinto
-- recinto_electoral.codigo_territorial -> distribucion_territorial.codigo_territorial
