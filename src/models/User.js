const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  nomeCompleto: {
    type: String,
    required: [true, 'Nome completo é obrigatório'],
    trim: true,
    maxlength: [100, 'Nome não pode ter mais que 100 caracteres']
  },
  email: {
    type: String,
    required: [true, 'Email é obrigatório'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Por favor, insira um email válido']
  },
  cpf: {
    type: String,
    required: [true, 'CPF é obrigatório'],
    unique: true,
    validate: {
      validator: function(v) {
        return /^\d{11}$/.test(v);
      },
      message: props => `${props.value} não é um CPF válido! Deve conter 11 dígitos.`
    }
  },
  senha: {
    type: String,
    required: [true, 'Senha é obrigatória'],
    minlength: [6, 'Senha deve ter no mínimo 6 caracteres'],
    select: false
  },
  dataNascimento: {
    type: Date,
    required: [true, 'Data de nascimento é obrigatória'],
    validate: {
      validator: function(v) {
        return v < new Date();
      },
      message: 'Data de nascimento não pode ser no futuro'
    }
  },
  telefone: {
    type: String,
    required: [true, 'Telefone é obrigatório'],
    validate: {
      validator: function(v) {
        return /^\d{10,11}$/.test(v);
      },
      message: props => `${props.value} não é um telefone válido! Deve conter 10 ou 11 dígitos.`
    }
  },
  enderecos: [{
    cep: {
      type: String,
      required: [true, 'CEP é obrigatório'],
      validate: {
        validator: function(v) {
          return /^\d{8}$/.test(v);
        },
        message: props => `${props.value} não é um CEP válido! Deve conter 8 dígitos.`
      }
    },
    logradouro: {
      type: String,
      required: [true, 'Logradouro é obrigatório'],
      trim: true,
      maxlength: [200, 'Logradouro não pode ter mais que 200 caracteres']
    },
    numero: {
      type: String,
      required: [true, 'Número é obrigatório'],
      trim: true,
      maxlength: [10, 'Número não pode ter mais que 10 caracteres']
    },
    complemento: {
      type: String,
      trim: true,
      maxlength: [100, 'Complemento não pode ter mais que 100 caracteres']
    },
    bairro: {
      type: String,
      required: [true, 'Bairro é obrigatório'],
      trim: true,
      maxlength: [100, 'Bairro não pode ter mais que 100 caracteres']
    },
    cidade: {
      type: String,
      required: [true, 'Cidade é obrigatória'],
      trim: true,
      maxlength: [100, 'Cidade não pode ter mais que 100 caracteres']
    },
    estado: {
      type: String,
      required: [true, 'Estado é obrigatório'],
      uppercase: true,
      enum: {
        values: ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'],
        message: '{VALUE} não é um estado válido'
      }
    },
    principal: {
      type: Boolean,
      default: false
    },
    _id: false
  }],
  orders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }],
  isAdmin: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Middleware para garantir que admin@gmail.com seja sempre admin
userSchema.pre('save', function(next) {
  if (this.email === 'admin@gmail.com') {
    this.isAdmin = true;
  }
  next();
});

// Hash da senha antes de salvar
userSchema.pre('save', async function(next) {
  if (!this.isModified('senha')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.senha = await bcrypt.hash(this.senha, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Atualizar updatedAt antes de salvar
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Método para comparar senhas
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.senha);
};

// Método para adicionar um novo endereço
userSchema.methods.addAddress = async function(newAddress) {
  // Se for o primeiro endereço, define como principal
  if (this.enderecos.length === 0) {
    newAddress.principal = true;
  }
  
  // Se for marcado como principal, remove a marcação dos outros
  if (newAddress.principal) {
    this.enderecos.forEach(addr => addr.principal = false);
  }
  
  this.enderecos.push(newAddress);
  return this.save();
};

// Método para definir endereço principal
userSchema.methods.setPrimaryAddress = async function(addressId) {
  this.enderecos.forEach(addr => {
    addr.principal = addr._id.toString() === addressId.toString();
  });
  return this.save();
};

// Método para adicionar um pedido ao histórico
userSchema.methods.addOrder = async function(orderId) {
  this.orders.push(orderId);
  return this.save();
};

module.exports = mongoose.model('User', userSchema);