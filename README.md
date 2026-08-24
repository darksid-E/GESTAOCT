
## Sobre o Projeto

O objetivo principal desta aplicação é simplificar o registro de dados operacionais. Desenvolvido para ser acessado de qualquer lugar e dispositivo, o sistema garante agilidade na alimentação das informações. Esse acesso rápido aos dados operacionais viabiliza análises precisas, contribuindo para uma tomada de decisão mais rápida e estrategicamente embasada.

## Principais Funcionalidades

### Gestão de Reparos

- **Mapa de Gestão:** Interface visual que indica o ponto exato do reparo e sua fase atual (baseado em dados e filtros aplicados). Inclui um dashboard integrado para acompanhamento quantitativo dos status.
- **Gerenciador de Reparos:** Módulo central de preenchimento. Oferece visualização 3D dos reparos (com esquema de cores intuitivo), geração de backlog e suporte para upload de fotos de "antes e depois".
- **Tabela Geral:** Relatório em formato de tabela com filtros para visualizar todos os lançamentos. Suporta impressão e edição de registros (restrito a usuários autorizados).

### Login e Autenticação Corporativa

- **Acesso Restrito:** O cadastro é exclusivo para colaboradores que possuem e-mail corporativo (Ternium).
- **Validação:** A leitura dos dados só é liberada após a confirmação do e-mail através de um link de verificação, garantindo a integridade do acesso.

## Stack Tecnológico

### Front-End

- **Estrutura:** Arquitetura modular construída em JavaScript, HTML5 e CSS, com infraestrutura já preparada para uma futura migração para TypeScript.
- **Performance:** Interface leve, rápida e responsiva. Atualmente centralizada em um único índice (Single Page), mas arquitetada para escalar facilmente para múltiplos módulos.

### Back-End (BaaS)

- **Banco de Dados:** Supabase. Solução escolhida para otimizar recursos operacionais, dispensando o uso de Máquinas Virtuais ou Servidores Dedicados.

## Segurança e Auditoria de Dados

- **Proteção de Acesso:** Implementação rigorosa de **RLS (Row Level Security)** e *Policies* do Supabase. Apenas usuários autenticados via OAuth (e validados com e-mail Ternium) conseguem acessar as tabelas.
- **Controle de Edição:** A alteração de registros é bloqueada por padrão. Apenas usuários autenticados com o status `isAdmin = true` no banco de dados têm permissão de escrita.
- **Rastreabilidade:** Todas as edições e atualizações geram um log de histórico, registrando qual usuário realizou a alteração.
