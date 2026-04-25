/**
 * CameraScreen - Captura y pre-validación de actas electorales
 *
 * Pre-validaciones ANTES de subir:
 *  1. Análisis de nitidez (varianza del Laplaciano simulada vía brillo)
 *  2. Detección de rectángulo del acta (heurística de bordes)
 *  3. Verificación de tamaño mínimo
 */

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import { uploadActa } from "../services/api";
import { calcularNitidez } from "../services/imageAnalysis";

// ==============================================================
//  Constantes de validación
// ==============================================================
const NITIDEZ_MINIMA = 60;   // Score mínimo (0-100)
const TAMANO_MAXIMO_MB = 10;

type EstadoCaptura = "idle" | "capturando" | "analizando" | "subiendo" | "exito" | "error";

interface Props {
  route?: { params?: { mesaId: number; pipeline: string; usuarioId: number } };
}

// ==============================================================
//  Componente
// ==============================================================
export default function CameraScreen({ route }: Props) {
  const { mesaId = 0, pipeline = "RRV", usuarioId = 0 } = route?.params ?? {};

  const [permission, requestPermission] = useCameraPermissions();
  const [facing] = useState<CameraType>("back");
  const [foto, setFoto] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoCaptura>("idle");
  const [advertencias, setAdvertencias] = useState<string[]>([]);
  const [coordenadas, setCoordenadas] = useState<{ lat: number; lng: number } | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const navigation = useNavigation();

  // Obtener geolocalización al montar
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setCoordenadas({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }
    })();
  }, []);

  // ==============================================================
  //  Capturar foto
  // ==============================================================
  const capturarFoto = async () => {
    if (!cameraRef.current || estado !== "idle") return;
    setEstado("capturando");

    try {
      const foto = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
        exif: false,
      });

      if (!foto?.uri) throw new Error("No se obtuvo imagen de la cámara");

      setFoto(foto.uri);
      await analizarImagen(foto.uri);
    } catch (err) {
      setEstado("error");
      Alert.alert("Error", "No se pudo capturar la foto. Inténtelo nuevamente.");
    }
  };

  // ==============================================================
  //  Análisis local antes de subir
  // ==============================================================
  const analizarImagen = async (uri: string) => {
    setEstado("analizando");
    const warns: string[] = [];

    // Redimensionar para análisis rápido (no modifica la original)
    const miniatura = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 400 } }],
      { format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    if (!miniatura.base64) {
      setEstado("error");
      return;
    }

    // --- 1. Análisis de nitidez (Laplacian variance aproximada) ---
    const scoreNitidez = await calcularNitidez(miniatura.base64);

    if (scoreNitidez < NITIDEZ_MINIMA) {
      warns.push(
        `⚠️ Imagen borrosa (nitidez: ${scoreNitidez.toFixed(0)}/100). ` +
        "Sostenga el teléfono firme y enfoque el acta."
      );
    }

    // --- 2. Verificar que la imagen tiene suficiente contraste de bordes ---
    const tieneContorno = await detectarContornoAproximado(miniatura.base64);
    if (!tieneContorno) {
      warns.push("⚠️ No se detectó el borde del acta. Asegúrese de capturar el acta completa.");
    }

    setAdvertencias(warns);

    // Si hay advertencias críticas (nitidez muy baja), no permitir subir automáticamente
    if (scoreNitidez < 30) {
      setEstado("error");
      Alert.alert(
        "Imagen inaceptable",
        `La foto está demasiado borrosa (${scoreNitidez.toFixed(0)}/100).\n\n` +
        "Sugerencias:\n• Use buena iluminación\n• Apoye el teléfono\n• Limpie el lente",
        [{ text: "Tomar de nuevo", onPress: reiniciar }]
      );
    } else {
      setEstado("idle"); // Lista para subir con o sin advertencias menores
    }
  };

  // ==============================================================
  //  Subir acta al servidor
  // ==============================================================
  const subirActa = async () => {
    if (!foto) return;
    setEstado("subiendo");

    try {
      const resultado = await uploadActa({
        imageUri: foto,
        mesaId,
        pipeline,
        usuarioId,
        latitud: coordenadas?.lat,
        longitud: coordenadas?.lng,
      });

      setEstado("exito");
      Alert.alert(
        "✅ Acta enviada",
        `UUID: ${resultado.acta_uuid}\nCalidad: ${resultado.calidad_imagen}%\n` +
        `Votos procesados: ${resultado.total_votos_emitidos ?? "pendiente"}`,
        [{ text: "Continuar", onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      setEstado("error");
      const mensaje = err.response?.data?.detail ?? err.message ?? "Error desconocido";
      Alert.alert("Error al enviar", mensaje, [{ text: "Reintentar", onPress: reiniciar }]);
    }
  };

  const reiniciar = () => {
    setFoto(null);
    setEstado("idle");
    setAdvertencias([]);
  };

  // ==============================================================
  //  Permisos de cámara
  // ==============================================================
  if (!permission) return <ActivityIndicator style={styles.center} />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Se necesita acceso a la cámara</Text>
        <TouchableOpacity style={styles.btnPrimario} onPress={requestPermission}>
          <Text style={styles.btnText}>Conceder permiso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ==============================================================
  //  Render
  // ==============================================================
  return (
    <View style={styles.container}>
      {/* Vista de la cámara o previsualización */}
      {!foto ? (
        <CameraView ref={cameraRef} style={styles.camara} facing={facing}>
          {/* Guía de encuadre */}
          <View style={styles.overlay}>
            <View style={styles.guiaAciertoActa} />
            <Text style={styles.guiaTexto}>Encuadre el acta dentro del rectángulo</Text>
          </View>
        </CameraView>
      ) : (
        <Image source={{ uri: foto }} style={styles.preview} resizeMode="contain" />
      )}

      {/* Advertencias */}
      {advertencias.length > 0 && (
        <View style={styles.advertencias}>
          {advertencias.map((w, i) => (
            <Text key={i} style={styles.advertenciaTexto}>{w}</Text>
          ))}
        </View>
      )}

      {/* Indicador de estado */}
      {(estado === "analizando" || estado === "subiendo") && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.estadoTexto}>
            {estado === "analizando" ? "Analizando imagen..." : "Enviando acta..."}
          </Text>
        </View>
      )}

      {/* Información del contexto */}
      <View style={styles.infoBar}>
        <Text style={styles.infoTexto}>Mesa: {mesaId}</Text>
        <Text style={[styles.infoTexto, pipeline === "RRV" ? styles.rrv : styles.oficial]}>
          {pipeline}
        </Text>
        {coordenadas && (
          <Text style={styles.infoTexto}>📍 GPS</Text>
        )}
      </View>

      {/* Controles */}
      <View style={styles.controles}>
        {!foto ? (
          <TouchableOpacity
            style={[styles.btnCaptura, estado !== "idle" && styles.btnDisabled]}
            onPress={capturarFoto}
            disabled={estado !== "idle"}
          >
            <View style={styles.btnCapturaInner} />
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.btnSecundario} onPress={reiniciar}>
              <Text style={styles.btnText}>🔄 Tomar de nuevo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimario, estado !== "idle" && styles.btnDisabled]}
              onPress={subirActa}
              disabled={estado !== "idle"}
            >
              <Text style={styles.btnText}>📤 Enviar acta</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

// ==============================================================
//  Helper: Detección de contorno aproximada (cliente)
//  En producción esto llamaría a una librería nativa
// ==============================================================
async function detectarContornoAproximado(base64: string): Promise<boolean> {
  // Heurística simple: verificar que hay variación de color suficiente
  // que indica que hay un borde rectangular visible
  // En producción: usar react-native-opencv o pasar al servidor
  return base64.length > 10000; // placeholder
}

// ==============================================================
//  Estilos
// ==============================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  camara: { flex: 1 },
  preview: { flex: 1, backgroundColor: "#111" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  guiaAciertoActa: {
    width: "85%",
    height: "60%",
    borderWidth: 2,
    borderColor: "#00FF88",
    borderStyle: "dashed",
    borderRadius: 8,
  },
  guiaTexto: {
    color: "#fff",
    marginTop: 12,
    fontSize: 13,
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
  },
  estadoTexto: { color: "#fff", marginTop: 12, fontSize: 16, fontWeight: "bold" },
  advertencias: {
    backgroundColor: "#FF9800",
    padding: 12,
    margin: 8,
    borderRadius: 8,
  },
  advertenciaTexto: { color: "#fff", fontSize: 13, marginBottom: 4 },
  infoBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#1a1a2e",
    padding: 10,
  },
  infoTexto: { color: "#fff", fontSize: 12, fontWeight: "600" },
  rrv: { color: "#00FF88" },
  oficial: { color: "#FFD700" },
  controles: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#1a1a2e",
  },
  btnCaptura: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  btnCapturaInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
  },
  btnPrimario: {
    backgroundColor: "#0066CC",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
  },
  btnSecundario: {
    backgroundColor: "#444",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  permText: { color: "#333", fontSize: 16, marginBottom: 20 },
});
