import express, { type Router, type Request, type Response } from "express";
import { auth } from "../lib/auth.ts";

const routerAuth = express.Router();

type BodyEmailPassword = {
  name?: string;
  email: string;
  password: string;
  image?: string;
};

routerAuth.post("/sign-in/email", async (req: Request, res: Response) => {
  const { password, email } = req.body as BodyEmailPassword;

  try {
    const response = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
      asResponse: true,
    });

    for (const cookie of response.headers.getSetCookie()) {
      res.appendHeader("Set-Cookie", cookie);
    }
    return res.status(response.status).json(await response.json());
  } catch (error) {
    return res.status(404).json({ message: "invalid credential" });
  }
});

routerAuth.post("/sign-up/email", async (req: Request, res: Response) => {
  const { name, password, email, image } = req.body as BodyEmailPassword;

  if (!name) return res.status(400).json({ message: "error" });
  const data = await auth.api.signUpEmail({
    body: {
      name, // required, The name of the user.
      email, // required, The email address of the user.
      password, // required, The password of the user. It should be at least 8 characters long and max 128 by default.
      image, // An optional profile image of the user.
    },
  });
  console.log(data);
  return res.status(200).json({ message: "added" });
});

routerAuth.get("/sign-out/email", async (req: Request, res: Response) => {});

export { routerAuth };
