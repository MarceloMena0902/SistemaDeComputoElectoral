// init-replica.js
// Este script se ejecuta automáticamente cuando MongoDB inicia

// Esperar a que MongoDB esté listo
sleep(2000);

// Inicializar replica set
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "rrv_mongo_primary:27017", priority: 2 },
    { _id: 1, host: "rrv_mongo_secondary:27017", priority: 1 }
  ]
});

print("✅ Replica Set inicializado automáticamente");
