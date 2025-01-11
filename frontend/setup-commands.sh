# Create main directory structure
mkdir -p src/{services,hooks,features,context,layouts,types,utils,constants,styles}

# Create feature directories
mkdir -p src/features/{auth,channels,messages,threads,users,shared}/components
mkdir -p src/features/{auth,channels,messages,threads,users,shared}/types

# Create styles directories
mkdir -p src/styles/components

# Create shared component directories
mkdir -p src/features/shared/components

# Install dependencies
npm install socket.io-client @types/socket.io-client react react-dom
npm install -D vite @vitejs/plugin-react @types/react @types/react-dom typescript 