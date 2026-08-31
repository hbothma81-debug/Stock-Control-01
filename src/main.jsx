import React from "react";
import ReactDOM from "react-dom/client";
import LoginGate from "./LoginGate.jsx";
import { installStorage } from "./lib/storage.js";

installStorage();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LoginGate />
  </React.StrictMode>
);
