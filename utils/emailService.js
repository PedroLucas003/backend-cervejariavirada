// // backend/utils/emailService.js
// const nodemailer = require('nodemailer');

// const sendOrderConfirmationEmail = async (order, customerEmail, breweryDetails) => {
//     try {
//         // Configuração do transportador de e-mail (usando Gmail como exemplo)
//         // Você pode mudar para SendGrid, Mailgun, etc., dependendo do seu provedor.
//         const transporter = nodemailer.createTransport({
//             service: process.env.EMAIL_SERVICE, // Ex: 'gmail', 'SendGrid', etc.
//             auth: {
//                 user: process.env.EMAIL_USER,    // Seu e-mail (ex: seu_email@gmail.com)
//                 pass: process.env.EMAIL_PASS     // Sua senha de aplicativo (para Gmail) ou senha normal
//             }
//         });

//         const orderItemsHtml = order.items.map(item => `
//             <li>
//                 ${item.quantity} x ${item.name} - R$ ${item.price.toFixed(2)} (Total: R$ ${(item.quantity * item.price).toFixed(2)})
//             </li>
//         `).join('');

//         const mailOptions = {
//             from: `"${breweryDetails.name}" <${breweryDetails.email}>`, // Remetente
//             to: customerEmail, // E-mail do cliente
//             subject: `Confirmação de Pedido #${order.orderNumber} - ${breweryDetails.name}`,
//             html: `
//                 <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
//                     <h2 style="color: #0056b3;">Olá, ${order.user.name}!</h2>
//                     <p>Seu pedido <strong>#${order.orderNumber}</strong> foi recebido e seu pagamento foi confirmado com sucesso!</p>
//                     <p>Agradecemos a sua compra na <strong>${breweryDetails.name}</strong>. Estamos preparando seus itens com carinho.</p>
                    
//                     <h3 style="color: #0056b3;">Detalhes do Pedido:</h3>
//                     <ul style="list-style: none; padding: 0;">
//                         ${orderItemsHtml}
//                     </ul>
//                     <p><strong>Total do Pedido:</strong> R$ ${order.totalAmount.toFixed(2)}</p>
//                     <p><strong>Status do Pagamento:</strong> ${order.paymentStatus}</p>
//                     <p><strong>Método de Pagamento:</strong> ${order.paymentMethod}</p>

//                     <h3 style="color: #0056b3;">Endereço de Entrega:</h3>
//                     <p>
//                         ${order.shippingAddress.street}, ${order.shippingAddress.number} ${order.shippingAddress.complement ? `- ${order.shippingAddress.complement}` : ''}<br/>
//                         ${order.shippingAddress.neighborhood}, ${order.shippingAddress.city} - ${order.shippingAddress.state}<br/>
//                         CEP: ${order.shippingAddress.zipCode}
//                     </p>

//                     <h3 style="color: #0056b3;">Informações da Cervejaria:</h3>
//                     <p>
//                         <strong>Nome:</strong> ${breweryDetails.name}<br/>
//                         <strong>Email:</strong> ${breweryDetails.email}<br/>
//                         <strong>Telefone:</strong> ${breweryDetails.phone}<br/>
//                         <strong>Endereço:</strong> ${breweryDetails.address}
//                     </p>

//                     <p>Se tiver alguma dúvida, entre em contato conosco.</p>
//                     <p>Atenciosamente,<br/>A equipe ${breweryDetails.name}</p>
//                 </div>
//             `
//         };

//         await transporter.sendMail(mailOptions);
//         console.log(`E-mail de confirmação enviado para ${customerEmail} para o pedido #${order.orderNumber}`);
//     } catch (error) {
//         console.error(`Erro ao enviar e-mail de confirmação para o pedido #${order.orderNumber}:`, error);
//         // Em um ambiente de produção, você pode querer registrar este erro em um sistema de log mais robusto
//     }
// };

// module.exports = {
//     sendOrderConfirmationEmail
// };