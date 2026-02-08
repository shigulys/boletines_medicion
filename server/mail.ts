import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendApprovalEmail = async (to: string, userName: string) => {
  if (!process.env.EMAIL_USER) {
    console.log('📧 Simulación de envío de correo (Faltan credenciales SMTP):');
    console.log(`Para: ${to}`);
    console.log(`Mensaje: Hola ${userName}, tu cuenta en el Sistema de Obra ha sido aprobada.`);
    return;
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,
    subject: 'Acceso Aprobado - Sistema de Obra',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
        <h2 style="color: #0056b3;">¡Acceso Autorizado!</h2>
        <p>Hola <strong>${userName}</strong>,</p>
        <p>Te informamos que el área de Tecnología ha aprobado tu solicitud de acceso al <strong>Sistema de Obra</strong>.</p>
        <p>Ya puedes iniciar sesión en la plataforma con tu correo corporativo:</p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <a href="http://localhost:5173" style="background: #0056b3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            ENTRAR AL SISTEMA
          </a>
        </div>
        <p style="font-size: 0.8rem; color: #888;">Este es un mensaje automático, por favor no lo respondas.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Correo de aprobación enviado a: ${to}`);
  } catch (error) {
    console.error('Error enviando correo:', error);
  }
};

export const sendNewRequestEmailToAdmin = async (userName: string, userEmail: string) => {
  if (!process.env.EMAIL_USER) {
    console.log('📧 Notificación para Admin (Simulación):');
    console.log(`Nueva solicitud de: ${userName} (${userEmail})`);
    return;
  }

  const adminEmail = process.env.EMAIL_USER; // Ajustar si el admin es otro correo

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: adminEmail,
    subject: 'Nueva Solicitud de Acceso - Sistema de Obra',
    html: `
      <h2>Hay una nueva solicitud pendiente</h2>
      <p>El usuario <strong>${userName}</strong> (${userEmail}) se ha registrado y está esperando aprobación.</p>
      <p>Por favor, ingrese al panel de administración para validar su acceso.</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error enviando correo al admin:', error);
  }
};
