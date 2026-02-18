// -------------------------------
// Importaciones de módulos base
// -------------------------------
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import crypto from "crypto";

// -------------------------------
// Configuración del entorno
// -------------------------------
import { PORT, SECRET_JWT_KEY, EMAIL_PASS, EMAIL_USER } from "./config.js";

// -------------------------------
// Base de datos y modelos
// -------------------------------
import conectaDB from "./db/bd.js";
import User from "./models/modelUser.js"; // Ajusta la ruta según tu proyecto

// -------------------------------
// Middlewares y repositorios
// -------------------------------
import { verifyAdmin } from "./middlewares/auth.js";
import { UserRepository } from "./user-repository.js";
import { subirArchivos } from "./middlewares/subirDatos.js";



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function conexion() {
	await conectaDB();
}

conexion();

const app = express()
app.use(express.static(path.join(__dirname, "public")));
app.use("/image", express.static(path.join(__dirname, "image")));

//app.use('/image', express.static('image'));
app.set('view engine', 'ejs')
app.set("views", path.join(__dirname, "views"));
app.use(express.json())

app.use(cookieParser()); // primero se carga cookieParser
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Middleware para extraer el usuario desde la cookie JWT
app.use((req, res, next) => {
	const token = req.cookies.access_token;
	// Inicializamos user en null
	req.user = null;
	if (token) {
		try {
			// Decodificamos el token
			const decoded = jwt.verify(token, SECRET_JWT_KEY);
			req.user = decoded; // guardamos la info del usuario en req.user
		} catch (err) {
			console.warn("Token inválido:", err.message);
		}
	}
	// Hacemos disponible `user` en todas las vistas EJS
	res.locals.user = req.user;

	next(); // seguimos con la siguiente ruta o middleware
});

// Middleware para desactivar caché
app.use((req, res, next) => {
	res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
	next();
});


app.get('/', (req, res) => {
	res.render('home')
})

app.get("/contacto", function (req, res) {// esta en la ruta para la view de contacto
	res.render("contacto")
})

app.get("/showUser", verifyAdmin, async (req, res) => {
	const users = await UserRepository.mostrarContactos();
	res.render("showUser", { users }); // <--- pasa el user aquí
});


app.get('/login', async (req, res) => {
	res.render('index', { showRegister: false, username: undefined })
})


app.get('/register', (req, res) => {
	res.render('index', { showRegister: true, username: undefined });
});

app.get('/perfil', async (req, res) => {
	if (!req.user) return res.status(403).send('Acces not authorized');
	// Obtener usuario completo con rol
	const user = await User.findById(req.user.id).populate('role'); // role será objeto completo

	res.render('perfil', { user })
})

app.get("/perfil", async (req, res) => {
    if (!req.user) return res.redirect("/login");

    console.log("Token decodificado:", req.user);

    const usuarioDB = await User.findById(req.user.id);  // <<--- AQUÍ LO TRAES COMPLETO

    console.log("Usuario real desde MongoDB:", usuarioDB);

    res.render("perfil", {
        user: usuarioDB
    });
});


app.post("/SolicitarDatos", subirArchivos(), async (req, res) => {
    if (!req.user) return res.status(403).send("Access not authorized");

    try {
        const userId = req.user.id; // El ID viene del token

        const nombre = req.body.nombre;
        const edad = req.body.edad;
        const telefono = req.body.telefono;

        const photo = req.file ? req.file.filename : null;

        const updateData = {
            nombre,
            edad,
            telefono
        };

        if (photo) {
            updateData.photoPerfil = photo;
        }

        // Actualizar usuario
        await User.findByIdAndUpdate(userId, updateData);

        // Traer usuario actualizado
        const usuarioActualizado = await User.findById(userId);

        console.log("Usuario REAL actualizado desde MongoDB:");
        console.log(usuarioActualizado);

        // Enviar a la vista
        res.render("perfil", { user: usuarioActualizado });

    } catch (error) {
        console.error("Error al actualizar datos", error);
        res.status(500).send("Error interno");
    }
});

app.get("/datosUsuario", async (req, res) => {
    try {
        if (!req.user) {
            return res.redirect("/login");
        }

        const usuarioBD = await User.findById(req.user.id);

        res.render("datosUsuario", { user: usuarioBD });
    } catch (err) {
        console.log(err);
        res.send("Error cargando datos");
    }
});
app.use('/uploads', express.static('uploads'));

app.get('/rutas', async (req, res) => {
	if (!req.user) return res.status(403).send('Acces not authorized');
	// Obtener usuario completo con rol
	const user = await User.findById(req.user.id).populate('role'); // role será objeto completo

	res.render('rutas', { user });
});


app.post('/login', async (req, res) => {
	const { username, password } = req.body
	try {
		const user = await UserRepository.login({ username, password })

		const token = jwt.sign(
			{ id: user._id, username: user.username, role: user.role.rol },
			SECRET_JWT_KEY,
			{ expiresIn: '1h' }
		)

		//en local storage o cookies: una cookie tiene un poquito mas seguridad y es vulnerable a un script 
		// pero tienene un caopa de sefuridad httpoli y no puede hacceder javascript y es algo mas de 
		// seguridad y expiran a diferencia de localstorage
		res
			.cookie('access_token', token, {
				httpOnly: true,// la cookie solo se puede acceder en el servidor Y NO SE VERA DESDE JAVASCRIPT
				secure: process.env.NODE_ENV == 'production',//la cookie solo se puede acceder en https
				sameSite: 'strict',// la cookie solo se puede acceder en el mismo dominio
				maxAge: 1000 * 60 * 60, // solo tiene validez una hora la cookie,
			}).send({ user, token })
		console.log("YA FUE VERIFICADO")
		console.log(user.role);
	} catch (error) {
		res.status(401).send(error.message)
	}
})

app.post('/register', async (req, res) => {
	const { username, email, password } = req.body;
	try {

		// Generar token de verificación
		const verificationToken = crypto.randomBytes(32).toString("hex");
		//primero se genera el token para luego enviarle el token como parametro al crear el usuario

		const id = await UserRepository.create({ username, email, password, verificationToken });
		// Configurar nodemailer
		const transporter = nodemailer.createTransport({
			service: "Gmail",
			auth: {
				user: EMAIL_USER,
				pass: EMAIL_PASS,
			},
		})

		const verificationLink = `http://localhost:3000/verify?token=${verificationToken}`;

		const mailOptions = {
			from: process.env.EMAIL_USER,
			to: email,
			subject: "Confirma tu cuenta",
			html: `
					<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; text-align: center;">
					
					<img src="https://i.postimg.cc/t4BLGm5m/logo-blanco.png" 
						alt="Logo" 
						style="width: 120px; margin-bottom: 20px;" />
					<h2 style="color: #28a745;">¡Haz clic para confirmar tu cuenta!</h2>
					<p>Hola <strong>${username}</strong>, gracias por registrarte. Para activar tu cuenta, haz clic en el botón de abajo:</p>
					
					<a href="${verificationLink}" 
						style="display: inline-block; padding: 12px 24px; margin: 20px 0; background-color: #007bff; color: #fff; text-decoration: none; border-radius: 6px;">
						Confirmar Cuenta
					</a>
					
					<p style="font-size: 0.9rem; color: #555;">Si no creaste esta cuenta, puedes ignorar este correo.</p>
					</div>
				`
		};


		await transporter.sendMail(mailOptions);
		res.send("Registro exitoso. Revisa tu correo para confirmar la cuenta.");

		// Después de registrar, puedes redirigir al login o mostrar mensaje
		//res.redirect('/login'); // aquí vas al login
	} catch (error) {
		console.error("Error en registro:", error.message);
		res.status(400).json({ error: "Error al registrar usuario" });
	}
});


app.post('/logout', (req, res) => {
	res
		.clearCookie('access_token')
		.json({ message: 'Logout successful' })
	// puedo redireccionara cualquier ruta o a donde quiera lo importante es que limpie la cookie
})

app.get('/protected', (req, res) => {
	if (!req.user) return res.status(403).send('Acces not authorized')
	res.render('protected')
})

app.listen(PORT, function () {
	console.log("Aplicacion en puerto: " + PORT)
})
app.get('/verify', async (req, res) => {
	const { token } = req.query; // extraemos el token de la URL

	if (!token) return res.status(400).send("Token no proporcionado");

	try {
		// Buscar usuario con ese token
		const user = await User.findOne({ verificationToken: token });
		if (!user) return res.status(400).send("Token inválido o ya usado");

		// Marcar usuario como verificado
		user.isVerified = true; // necesitas un campo booleano isVerified en tu modelo
		user.verificationToken = undefined; // eliminar token para que no se pueda usar otra vez

		await user.save();

		// Mostrar mensaje directamente
		res.render('verifySuccess', { username: user.username });
	} catch (error) {
		console.error(error);
		res.status(500).send("Error al verificar la cuenta");
	}
});


//editar usuario 
app.get("/editar/:id", async function editar(req, res) {
	try {
		const user = await UserRepository.buscarPorId(req.params.id)
		res.render("editarUser", { user })
	} catch (error) {
		console.log(error)
	}
})

app.post("/editarCambios", async function (req, res) {
	const respuesta = await UserRepository.editarContacto(req.body)
	console.log(respuesta, "editado")
	res.redirect("/showUser")
})

app.get("/eliminar/:id", async function (req, res) {
	const id = req.params.id; // recibimos un parametro a traves de la url el id 
	try {
		const userPorId = await UserRepository.buscarPorId(id)
		res.render("eliminarUser", { userPorId })
	} catch (error) {
		console.log("Error no se pudo actualizar", error)
	}
})

app.get("/eliminarConfirmado/:id", async function (req, res) {
	const respuesta = await UserRepository.eliminarContacto(req.params.id)
	//console.log(respuesta, "eliminado")
	res.redirect("/showUser")
})


app.post("/buscarContacto", async function (req, res) {
	const username = req.body.username
	const users = await UserRepository.buscarContacto(username)
	res.render("showUser", { users })
})

