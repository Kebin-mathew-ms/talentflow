import axios from "axios";

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;

  if (typeof window !== "undefined") {
    return `http://${window.location.hostname}:3000/api`;
  }

  return "http://localhost:3000/api";
};

export const API_BASE_URL = getApiBaseUrl();
export const SOCKET_URL = API_BASE_URL.replace(/\/api$/, "");

export const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});
