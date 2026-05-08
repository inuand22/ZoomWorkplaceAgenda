const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const dbPath = process.env.VERCEL ? "/tmp/agenda_zoom.db" : "./agenda_zoom.db";

const db = new sqlite3.Database(dbPath, function(error) {
  if (error) {
    console.error("Error al conectar con la base de datos:", error.message);
  } else {
    console.log("Base de datos conectada correctamente.");
  }
});

db.serialize(function() {
  db.run(`
    CREATE TABLE IF NOT EXISTS reservas_solicitudes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      hora_inicio TEXT NOT NULL,
      hora_fin TEXT NOT NULL,
      horario TEXT NOT NULL,
      motivo TEXT NOT NULL,
      responsable TEXT NOT NULL,
      unidad TEXT NOT NULL,
      gran_mando TEXT NOT NULL,
      observaciones TEXT
    )
  `);
});

app.get("/api/reservas", function(req, res) {
  const anio = req.query.anio;
  const mes = req.query.mes;

  if (!anio || !mes) {
    return res.status(400).json({ error: "Debe enviar año y mes." });
  }

  const inicio = anio + "-" + mes.padStart(2, "0") + "-01";
  const fin = anio + "-" + mes.padStart(2, "0") + "-31";

  db.all(
    "SELECT * FROM reservas_solicitudes WHERE fecha BETWEEN ? AND ? ORDER BY fecha, hora_inicio",
    [inicio, fin],
    function(error, filas) {
      if (error) {
        return res.status(500).json({ error: "Error al obtener reservas." });
      }

      res.json(filas);
    }
  );
});

app.post("/api/reservas", function(req, res) {
  const id = req.body.id || null;
  const fecha = req.body.fecha;
  const horaInicio = req.body.hora_inicio;
  const horaFin = req.body.hora_fin;
  const horario = horaInicio + " - " + horaFin;
  const motivo = req.body.motivo || "";
  const responsable = req.body.responsable || "";
  const unidad = req.body.unidad || "";
  const granMando = req.body.gran_mando || "";
  const observaciones = req.body.observaciones || "";

  if (!fecha || !horaInicio || !horaFin || !motivo || !responsable || !unidad || !granMando) {
    return res.status(400).json({
      error: "Todos los campos son obligatorios, excepto observaciones."
    });
  }

  const inicioMinutos = convertirHoraAMinutos(horaInicio);
  const finMinutos = convertirHoraAMinutos(horaFin);
  const minimo = convertirHoraAMinutos("08:00");
  const maximo = convertirHoraAMinutos("14:00");

  if (inicioMinutos < minimo) {
    return res.status(400).json({
      error: "La hora de inicio no puede ser menor a 08:00."
    });
  }

  if (finMinutos > maximo) {
    return res.status(400).json({
      error: "La hora de fin no puede superar las 14:00."
    });
  }

  if (finMinutos <= inicioMinutos) {
    return res.status(400).json({
      error: "La hora de fin debe ser mayor a la hora de inicio."
    });
  }

  db.all(
    "SELECT * FROM reservas_solicitudes WHERE fecha = ?",
    [fecha],
    function(error, reservasDelDia) {
      if (error) {
        return res.status(500).json({ error: "Error al validar disponibilidad." });
      }

      let cantidadSuperpuesta = 0;

      for (let i = 0; i < reservasDelDia.length; i++) {
        const reserva = reservasDelDia[i];

        if (id !== null && id !== "" && parseInt(reserva.id) === parseInt(id)) {
          continue;
        }

        const reservaInicio = convertirHoraAMinutos(reserva.hora_inicio);
        const reservaFin = convertirHoraAMinutos(reserva.hora_fin);

        const seSuperpone = inicioMinutos < reservaFin && finMinutos > reservaInicio;

        if (seSuperpone) {
          cantidadSuperpuesta++;
        }
      }

      if (cantidadSuperpuesta >= 3) {
        return res.status(400).json({
          error: "No hay disponibilidad para ese horario. Ya existen 3 licencias solicitadas."
        });
      }

      if (id !== null && id !== "") {
        db.run(
          `
          UPDATE reservas_solicitudes
          SET fecha = ?, hora_inicio = ?, hora_fin = ?, horario = ?, motivo = ?, responsable = ?, unidad = ?, gran_mando = ?, observaciones = ?
          WHERE id = ?
          `,
          [fecha, horaInicio, horaFin, horario, motivo, responsable, unidad, granMando, observaciones, id],
          function(error) {
            if (error) {
              return res.status(500).json({ error: "Error al actualizar la solicitud." });
            }

            res.json({ mensaje: "Solicitud actualizada correctamente." });
          }
        );
      } else {
        db.run(
          `
          INSERT INTO reservas_solicitudes
          (fecha, hora_inicio, hora_fin, horario, motivo, responsable, unidad, gran_mando, observaciones)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [fecha, horaInicio, horaFin, horario, motivo, responsable, unidad, granMando, observaciones],
          function(error) {
            if (error) {
              return res.status(500).json({ error: "Error al guardar la solicitud." });
            }

            res.json({ mensaje: "Solicitud guardada correctamente." });
          }
        );
      }
    }
  );
});

app.delete("/api/reservas/:id", function(req, res) {
  const id = req.params.id;

  db.run(
    "DELETE FROM reservas_solicitudes WHERE id = ?",
    [id],
    function(error) {
      if (error) {
        return res.status(500).json({ error: "Error al eliminar la solicitud." });
      }

      res.json({ mensaje: "Solicitud eliminada correctamente." });
    }
  );
});

function convertirHoraAMinutos(hora) {
  const partes = hora.split(":");
  const horas = parseInt(partes[0]);
  const minutos = parseInt(partes[1]);

  return horas * 60 + minutos;
}

if (require.main === module) {
  app.listen(PORT, function() {
    console.log("Servidor iniciado en http://localhost:" + PORT);
  });
}

module.exports = app;