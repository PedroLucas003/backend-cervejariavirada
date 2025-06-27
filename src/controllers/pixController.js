const QRCode = require('qrcode');
const Order = require('../models/Order');

// Gerar payload PIX estático (sem API externa)
function generatePixPayload(orderId, amount, merchantName, merchantCity, pixKey) {
  // Garante que o valor tenha sempre duas casas decimais (ex: 30.00)
  const formattedAmount = amount.toFixed(2);

  // --- Campo 26: Merchant Account Information (Informações da Conta do Comerciante) ---
  // Este campo contém o GUI (br.gov.bcb.pix) e a chave PIX
  const guiPix = '0014br.gov.bcb.pix';
  const pixKeyField = `01${pixKey.length.toString().padStart(2, '0')}${pixKey}`;
  
  // O valor completo do campo 26 é a concatenação do GUI e da chave PIX
  const merchantAccountInfoValue = `${guiPix}${pixKeyField}`;
  // O tamanho do valor do campo 26
  const merchantAccountInfoLength = merchantAccountInfoValue.length.toString().padStart(2, '0');
  // O campo 26 completo (ID + Tamanho + Valor)
  const field26 = `26${merchantAccountInfoLength}${merchantAccountInfoValue}`;

  // --- Campo 54: Transaction Amount (Valor da Transação) ---
  const field54 = `54${formattedAmount.length.toString().padStart(2, '0')}${formattedAmount}`;

  // --- Campo 59: Merchant Name (Nome do Beneficiário) ---
  const field59 = `59${merchantName.length.toString().padStart(2, '0')}${merchantName}`;

  // --- Campo 60: Merchant City (Cidade do Beneficiário) ---
  const field60 = `60${merchantCity.length.toString().padStart(2, '0')}${merchantCity}`;

  // --- Campo 62: Additional Data Field Template (Campo de Dados Adicionais) ---
  // Este campo é um template e geralmente contém subcampos.
  // O subcampo '05' é usado para o Transaction ID (ID da Transação/Referência)
  const txid = orderId; // Usamos o orderId como o ID da transação
  const id05Value = txid; // O valor real do ID da transação
  const id05Length = id05Value.length.toString().padStart(2, '0'); // O tamanho do ID da transação
  
  // O subcampo '05' completo (ID + Tamanho + Valor)
  const additionalDataField = `05${id05Length}${id05Value}`; 

  // O tamanho do valor completo do campo 62 (que é o subcampo '05' que acabamos de criar)
  const field62ValueLength = additionalDataField.length.toString().padStart(2, '0');
  // O campo 62 completo (ID + Tamanho + Valor)
  const field62 = `62${field62ValueLength}${additionalDataField}`;

  // Monta o payload base concatenando todos os campos formatados
  const payloadBase = [
    '000201', // ID 00: Payload Format Indicator
    field26,    // ID 26: Merchant Account Information (com GUI e chave PIX)
    '52040000', // ID 52: Merchant Category Code (MCC)
    '5303986',  // ID 53: Transaction Currency (986 = BRL)
    field54,    // ID 54: Transaction Amount
    '5802BR',   // ID 58: Country Code (BR = Brasil)
    field59,    // ID 59: Merchant Name
    field60,    // ID 60: Merchant City
    field62,    // ID 62: Additional Data Field Template (com ID da transação)
    '6304'      // ID 63: CRC16 (apenas o ID do campo, o valor será calculado e anexado)
  ].join('');

  // Calcula o CRC16 sobre o payload base (incluindo o '6304' que é o ID do campo CRC)
  const crc = calculateCRC16(payloadBase);
  
  // Retorna o payload completo com o CRC anexado
  return payloadBase + crc;
}

// A função calculateCRC16 permanece a mesma e está correta
function calculateCRC16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

// As funções generatePixPayment, checkPaymentStatus e confirmPayment permanecem as mesmas
exports.generatePixPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    const { user } = req; 

    const PIX_CONFIG = {
      pixKey: process.env.PIX_KEY, 
      merchantName: process.env.MERCHANT_NAME,
      merchantCity: process.env.MERCHANT_CITY,
    };

    console.log('PIX_CONFIG carregado:', PIX_CONFIG);
    if (!PIX_CONFIG.pixKey || !PIX_CONFIG.merchantName || !PIX_CONFIG.merchantCity) {
        console.error('ERRO: Variáveis de ambiente PIX (PIX_KEY, MERCHANT_NAME, MERCHANT_CITY) não estão definidas corretamente no .env!');
        return res.status(500).json({ message: 'Erro de configuração do PIX no servidor. Verifique as variáveis de ambiente.' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Pedido não encontrado' });
    }

    if (order.status !== 'pending' && order.paymentInfo.paymentStatus !== 'pending') {
      return res.status(400).json({ message: 'Pedido já foi processado ou está em status inválido para PIX.' });
    }

    const pixCode = generatePixPayload(
      order._id.toString(),
      order.total, 
      PIX_CONFIG.merchantName,
      PIX_CONFIG.merchantCity,
      PIX_CONFIG.pixKey 
    );

    console.log('PIX Payload gerado (pixCode):', pixCode);
    if (!pixCode) {
        console.error('ERRO: pixCode está vazio ou inválido após generatePixPayload.');
        return res.status(500).json({ message: 'Erro interno ao gerar o código PIX.' });
    }

    const qrCodeBase64 = await QRCode.toDataURL(pixCode);

    console.log('QR Code Base64 gerado (parcial):', qrCodeBase64.substring(0, 50) + '...');
    if (!qrCodeBase64) {
        console.error('ERRO: qrCodeBase64 está vazio ou inválido após QRCode.toDataURL.');
        return res.status(500).json({ message: 'Erro interno ao gerar o QR Code.' });
    }

    order.paymentInfo = {
      ...order.paymentInfo, 
      paymentMethod: 'pix',
      pixCode: pixCode, 
      qrCodeBase64: qrCodeBase64,
      paymentStatus: 'pending',
      expirationDate: new Date(Date.now() + 30 * 60 * 1000) 
    };

    await order.save(); 

    res.json({
      success: true,
      qrCodeBase64: order.paymentInfo.qrCodeBase64,
      pixCode: order.paymentInfo.pixCode, 
      expirationDate: order.paymentInfo.expirationDate,
      amount: order.total 
    });

  } catch (error) {
    console.error('Erro ao gerar pagamento PIX:', error);
    res.status(500).json({ 
      message: 'Erro ao gerar pagamento PIX',
      error: error.message
    });
  }
};

exports.checkPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ message: 'Pedido não encontrado' });
    }

    res.json({
      paymentStatus: order.paymentInfo.paymentStatus,
      orderStatus: order.status
    });

  } catch (error) {
    console.error('Erro ao verificar status do pagamento:', error);
    res.status(500).json({ message: 'Erro ao verificar status' });
  }
};

exports.confirmPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ message: 'Pedido não encontrado' });
    }

    order.paymentInfo.paymentStatus = 'approved';
    order.status = 'paid';
    await order.save();

    res.json({ success: true, message: 'Pagamento confirmado com sucesso' });

  } catch (error) {
    console.error('Erro ao confirmar pagamento:', error);
    res.status(500).json({ message: 'Erro ao confirmar pagamento' });
  }
};
