import { createRoot } from "react-dom/client";
import { SearchApp } from "./SearchApp";
import "./search-app.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing Search App root");

createRoot(root).render(<SearchApp />);
