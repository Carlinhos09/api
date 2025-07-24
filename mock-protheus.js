const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3001;

// Configuração aprimorada do CORS para ngrok
app.use(cors({
  origin: '*', // Permite qualquer origem (em produção, restrinja isso!)
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Configurações
const DATA_FILE = path.join(__dirname, 'quartos-data.json');
const USERS_FILE = path.join(__dirname, 'users-data.json');

// Carrega dados
let quartosPCM = loadData();
let usuariosData = loadUsers();

// Funções de carregamento
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      // Garante que todos os quartos tenham a propriedade CHECKLIST
      for (const id in data) {
        if (!data[id].CHECKLIST) {
          data[id].CHECKLIST = [];
        }
      }
      return data;
    }
  } catch (error) {
    console.error('Erro ao carregar quartos:', error);
  }

  const defaultData = {};
  for (let andar = 1; andar <= 9; andar++) {
    for (let numero = 1; numero <= 22; numero++) {
      defaultData[andar * 100 + numero] = {
        ID_QUARTO: andar * 100 + numero,
        STATUS: 'Vago limpo',
        CHECKLIST: [],
        ANDAR: andar,
        ULTIMA_ATUALIZACAO: new Date().toISOString()
      };
    }
  }
  saveData(defaultData);
  return defaultData;
}

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Erro ao carregar usuários:', error);
  }

  const defaultUsers = [
    { email: "admin@goinn.com", senha: "admin123", role: "admin", nickname: "Administrador" },
    { email: "user@goinn.com", senha: "user123", role: "user", nickname: "Usuário" },
    { email: "carlos@goinn.com", senha: "carlos123", role: "user", nickname: "Carlos" },
    { email: "douglas@goinn.com", senha: "123", role: "user", nickname: "Douglas" }
  ];
  saveUsers(defaultUsers);
  return defaultUsers;
}

// Funções de salvamento
function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log('Dados dos quartos salvos em:', DATA_FILE);
  } catch (error) {
    console.error('Erro ao salvar dados dos quartos:', error);
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    console.log('Dados dos usuários salvos em:', USERS_FILE);
  } catch (error) {
    console.error('Erro ao salvar dados dos usuários:', error);
  }
}

// Middleware de autenticação
function authenticate(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido' });
  
  const user = usuariosData.find(u => u.email === token);
  if (!user) return res.status(403).json({ success: false, error: 'Token inválido' });
  
  req.user = user;
  next();
}

// Middleware para salvar dados após atualização
function saveOnUpdate(req, res, next) {
  const originalJson = res.json;
  res.json = function(data) {
    if (req.method === 'POST' && req.path.includes('/atualizar') && data.success) {
      saveData(quartosPCM);
    }
    originalJson.call(res, data);
  };
  next();
}

// Rotas de autenticação
app.post('/api/auth/login', (req, res) => {
  const { email, senha } = req.body;
  const usuario = usuariosData.find(u => u.email === email && u.senha === senha);
  
  if (usuario) {
    res.json({ 
      success: true, 
      user: { 
        email: usuario.email,
        role: usuario.role,
        nickname: usuario.nickname || usuario.email.split('@')[0] // Fallback para parte do email
      },
      token: usuario.email
    });
  } else {
    res.status(401).json({ success: false, error: 'Credenciais inválidas' });
  }
});

app.post('/api/auth/register', (req, res) => {
  const { email, senha, nickname } = req.body;
  
  if (!email || !senha) {
    return res.status(400).json({ success: false, error: 'E-mail e senha são obrigatórios' });
  }

  if (usuariosData.some(u => u.email === email)) {
    return res.status(400).json({ success: false, error: 'E-mail já cadastrado' });
  }

  const novoUsuario = { email, senha, role: "user", nickname: nickname || email.split('@')[0] };
  usuariosData.push(novoUsuario);
  saveUsers(usuariosData);
  
  res.json({ 
    success: true, 
    user: { email, role: "user", nickname: novoUsuario.nickname },
    token: email
  });
});

// Adicione uma nova rota para atualizar nickname
app.post('/api/admin/users/update-nickname', authenticate, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Acesso negado' });
  }

  const { email, nickname } = req.body;
  const user = usuariosData.find(u => u.email === email);
  
  if (!user) {
    return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
  }

  user.nickname = nickname;
  saveUsers(usuariosData);

  res.json({ 
    success: true,
    message: `Apelido de ${email} atualizado para "${nickname}"`
  });
});

// Rotas dos quartos
app.get('/api/quartos', (req, res) => {
  const { status, andar } = req.query;
  let quartos = Object.values(quartosPCM);

  if (status) quartos = quartos.filter(q => q.STATUS === status);
  if (andar) quartos = quartos.filter(q => q.ANDAR === parseInt(andar));

  res.json({
    success: true,
    data: quartos,
    total: quartos.length,
    lastUpdated: new Date().toISOString()
  });
});

app.get('/api/quartos/andar/:numero', (req, res) => {
  const andar = parseInt(req.params.numero);
  if (andar < 1 || andar > 9) {
    return res.status(400).json({
      success: false,
      error: 'Andar inválido. Deve ser entre 1 e 9'
    });
  }

  const quartosAndar = Object.values(quartosPCM).filter(q => q.ANDAR === andar);
  
  res.json({
    success: true,
    data: quartosAndar,
    total: quartosAndar.length,
    andar: andar
  });
});

app.get('/api/quartos/:id', (req, res) => {
  const quarto = quartosPCM[req.params.id];
  if (quarto) {
    res.json({ 
      success: true, 
      data: quarto,
      message: `Quarto ${req.params.id} encontrado`
    });
  } else {
    res.status(404).json({ 
      success: false,
      error: `Quarto ${req.params.id} não encontrado`,
      suggestion: 'IDs válidos vão de 101-122, 201-222, ..., 901-922'
    });
  }
});

app.post('/api/quartos/atualizar', saveOnUpdate, (req, res) => {
  const { id, status } = req.body;
  
  if (!quartosPCM[id]) {
    return res.status(404).json({
      success: false,
      error: `Quarto ${id} não existe`,
      validFloors: '1-9',
      validRooms: '01-22 por andar'
    });
  }

  const statusValidos = ['Vago limpo', 'Vago sujo', 'Ocupado'];
  if (!statusValidos.includes(status)) {
    return res.status(400).json({
      success: false,
      error: 'Status inválido',
      validStatus: statusValidos
    });
  }

  quartosPCM[id] = {
    ...quartosPCM[id],
    STATUS: status,
    ULTIMA_ATUALIZACAO: new Date().toISOString()
  };

  res.json({
    success: true,
    message: `Quarto ${id} atualizado para: ${status}`,
    data: quartosPCM[id]
  });
});

app.post('/api/quartos/atualizar-checklist', saveOnUpdate, (req, res) => {
  const { id, checklist } = req.body;
  
  if (!quartosPCM[id]) {
    return res.status(404).json({
      success: false,
      error: `Quarto ${id} não existe`,
      validFloors: '1-9',
      validRooms: '01-22 por andar'
    });
  }

  if (!Array.isArray(checklist)) {
    return res.status(400).json({
      success: false,
      error: 'Checklist deve ser um array'
    });
  }

  quartosPCM[id] = {
    ...quartosPCM[id],
    CHECKLIST: checklist,
    ULTIMA_ATUALIZACAO: new Date().toISOString()
  };

  res.json({
    success: true,
    message: `Checklist do quarto ${id} atualizado`,
    data: quartosPCM[id]
  });
});

app.post('/api/quartos/reset', saveOnUpdate, (req, res) => {
  for (const id in quartosPCM) {
    quartosPCM[id].STATUS = 'Vago limpo';
    quartosPCM[id].ULTIMA_ATUALIZACAO = new Date().toISOString();
  }
  
  res.json({
    success: true,
    message: `Todos os ${Object.keys(quartosPCM).length} quartos resetados para "Vago limpo"`,
    timestamp: new Date().toISOString()
  });
});

// Rotas administrativas
app.get('/api/admin/users', authenticate, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Acesso negado' });
  }

  const users = usuariosData.map(u => ({
    email: u.email,
    role: u.role,
    nickname: u.nickname || u.email.split('@')[0],
    createdAt: new Date().toISOString()
  }));

  res.json({ success: true, data: users });
});

app.post('/api/admin/users', authenticate, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Acesso negado' });
  }

  const { email, password, role, nickname } = req.body;
  
  if (!email || !password || !role) {
    return res.status(400).json({ success: false, error: 'Todos os campos são obrigatórios' });
  }

  if (usuariosData.some(u => u.email === email)) {
    return res.status(400).json({ success: false, error: 'E-mail já cadastrado' });
  }

  const novoUsuario = { email, senha: password, role, nickname: nickname || email.split('@')[0] };
  usuariosData.push(novoUsuario);
  saveUsers(usuariosData);

  res.json({ 
    success: true,
    user: { email, role, nickname: novoUsuario.nickname }
  });
});

app.delete('/api/admin/users/:email', authenticate, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Acesso negado' });
  }

  const email = req.params.email;
  const index = usuariosData.findIndex(u => u.email === email);
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
  }

  usuariosData.splice(index, 1);
  saveUsers(usuariosData);

  res.json({ 
    success: true,
    message: `Usuário ${email} removido com sucesso`
  });
});

// Rota Raiz
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Mock PCM - Gestão de Quartos</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { color: #2c3e50; }
        .endpoint { background: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .method { display: inline-block; padding: 3px 8px; border-radius: 3px; font-weight: bold; color: white; }
        .get { background: #61affe; } .post { background: #49cc90; }
        pre { background: #292d3e; color: #bfc7d5; padding: 15px; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Mock PCM - Sistema de Gestão de Quartos</h1>
        <p>Servidor rodando na porta ${PORT}</p>
        
        <div class="endpoint">
          <span class="method post">POST</span>
          <strong>/api/auth/login</strong>
          <p>Autenticação de usuários</p>
        </div>
        
        <div class="endpoint">
          <span class="method get">GET</span>
          <strong>/api/quartos</strong>
          <p>Lista todos os quartos</p>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Middleware para logs
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Middleware para tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro no servidor:', err);
  res.status(500).json({
    success: false,
    error: 'Erro interno no servidor'
  });
});

// Desligamento gracioso
process.on('SIGINT', () => {
  console.log('\nSalvando dados antes de desligar...');
  saveData(quartosPCM);
  saveUsers(usuariosData);
  process.exit();
});

// Inicia o servidor (AGORA COM SUPORTE PARA REDE EXTERNA)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  🚀 Servidor mock do PCM rodando em:
  • Local: http://localhost:${PORT}
  • Rede: http://${getLocalIpAddress()}:${PORT}

  🔧 Use o ngrok para expor publicamente:
  1. Execute: ngrok http ${PORT}
  2. Acesse a URL fornecida (ex: https://abc123.ngrok.io)

  📊 Estatísticas:
  • Quartos carregados: ${Object.keys(quartosPCM).length}
  • Usuários cadastrados: ${usuariosData.length}
  
  🔧 Endpoints principais:
  • POST   /api/auth/login     - Autenticação
  • POST   /api/auth/register  - Registro
  • GET    /api/quartos        - Lista quartos
  • POST   /api/quartos/atualizar - Atualiza status
  • POST   /api/quartos/atualizar-checklist - Atualiza checklist
  
  ⚠️  Use Ctrl+C para parar o servidor
  `);
});

// Função para obter o IP local (útil para acesso na rede)
function getLocalIpAddress() {
  const interfaces = require('os').networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '0.0.0.0';
}