const WebSocket = require('ws');

class WebSocketFarm {
  constructor(builder) {
    this.sockets = new Map();
    this.waitingTasks = new Map();
    this.idleCount = 0;
    this.builder = builder;
    this.isRunning = false;
  }

  async addWebSocketAsync(route, socket) {
    return new Promise((resolve) => {
      this.sockets.set(route, this.sockets.get(route) || []);
      this.sockets.get(route).push(socket);
      this.idleCount++;
      resolve();
    });
  }

  async removeWebSocketAsync(route, socket) {
    return new Promise((resolve) => {
      if (this.sockets.has(route)) {
        const index = this.sockets.get(route).indexOf(socket);
        if (index > -1) {
          this.sockets.get(route).splice(index, 1);
          this.idleCount--;
          if (this.waitingTasks.has(route)) {
            const task = this.waitingTasks.get(route).shift();
            if (task) task(socket);
          }
        }
      }
      resolve();
    });
  }

  async getSocket(route) {
    return new Promise((resolve, reject) => {
      if (this.sockets.has(route) && this.sockets.get(route).length > 0) {
        resolve(this.sockets.get(route).shift());
        this.idleCount--;
      } else {
        // Implement waiting logic here
        this.waitingTasks.set(route, (this.waitingTasks.get(route) || []).concat(resolve));
      }
    });
  }

  async start() {
    this.isRunning = true;
    // Any startup logic can go here
  }
    
  async stop() {
    this.isRunning = false;

    // Close all sockets
    for (let socketList of this.sockets.values()) {
      for (let socket of socketList) {
        await this.closeSocket(socket);
      }
    }

    // Clear all data structures
    this.sockets.clear();
    this.waitingTasks.clear();
    this.idleCount = 0;

    // Any additional cleanup can go here
  }

  async closeSocket(socket) {
    try {
      if (socket.close) {
        await socket.close();
      } else if (socket.terminate) {
        socket.terminate();
      }
    } catch (error) {
      console.error('Error closing socket:', error);
    }
  }
  // Implement other methods...
}

module.exports = WebSocketFarm;
